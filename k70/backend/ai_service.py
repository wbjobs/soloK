import gc
import torch
import numpy as np
from PIL import Image, ImageFilter
from diffusers import StableDiffusionInpaintPipeline
from transformers import CLIPProcessor, CLIPModel
from typing import Callable, Optional
from .config import settings

class ProgressCallback:
    def __init__(self, total_steps: int, callback: Callable[[float], None]):
        self.total_steps = total_steps
        self.current_step = 0
        self.callback = callback
    
    def __call__(self, step: int, timestep: int, latents: torch.FloatTensor):
        self.current_step = step + 1
        progress = (self.current_step / self.total_steps) * 100
        self.callback(progress)

class StyleExtractor:
    _instance = None
    _model = None
    _processor = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def load_model(self):
        if self._model is None:
            print("Loading CLIP model for style extraction...")
            model_name = "openai/clip-vit-base-patch32"
            self._processor = CLIPProcessor.from_pretrained(model_name)
            self._model = CLIPModel.from_pretrained(model_name)
            self._model = self._model.to(settings.DEVICE)
            print("CLIP model loaded successfully!")
    
    @torch.no_grad()
    def extract_style_description(self, reference_image: Image.Image) -> str:
        self.load_model()
        
        image = reference_image.convert("RGB")
        
        inputs = self._processor(images=image, return_tensors="pt")
        inputs = {k: v.to(settings.DEVICE) for k, v in inputs.items()}
        
        image_features = self._model.get_image_features(**inputs)
        image_features = image_features / image_features.norm(dim=-1, keepdim=True)
        
        style_prompts = [
            "a photo in minimalist style",
            "a photo in vintage style",
            "a photo in modern style",
            "a photo in artistic style",
            "a photo in fashion style",
            "a photo in casual style",
            "a photo in elegant style",
            "a photo in streetwear style",
            "a photo with bright colors",
            "a photo with pastel colors",
            "a photo with dark moody colors",
            "a photo with warm tones",
            "a photo with cool tones",
        ]
        
        text_inputs = self._processor(text=style_prompts, return_tensors="pt", padding=True)
        text_inputs = {k: v.to(settings.DEVICE) for k, v in text_inputs.items()}
        text_features = self._model.get_text_features(**text_inputs)
        text_features = text_features / text_features.norm(dim=-1, keepdim=True)
        
        similarity = (100.0 * image_features @ text_features.T).softmax(dim=-1)
        values, indices = similarity[0].topk(3)
        
        matched_styles = []
        for value, idx in zip(values, indices):
            if value > 10:
                style_text = style_prompts[idx].replace("a photo in ", "").replace("a photo with ", "")
                matched_styles.append(style_text)
        
        if matched_styles:
            return ", ".join(matched_styles[:2])
        
        dominant_color = self._get_dominant_color(image)
        return f"{dominant_color} tones"
    
    def _get_dominant_color(self, image: Image.Image) -> str:
        small_img = image.resize((50, 50))
        pixels = np.array(small_img).reshape(-1, 3)
        
        avg_color = np.mean(pixels, axis=0)
        r, g, b = avg_color
        
        brightness = (r + g + b) / 3
        saturation = max(r, g, b) - min(r, g, b)
        
        if brightness < 60:
            return "dark"
        elif brightness > 200:
            return "bright"
        
        if saturation < 30:
            return "neutral"
        
        if r > g and r > b:
            if g > b * 1.5:
                return "warm orange"
            return "warm red"
        elif g > r and g > b:
            return "fresh green"
        else:
            if r > g * 0.8:
                return "cool purple"
            return "cool blue"

style_extractor = StyleExtractor()

class InpaintingService:
    _instance = None
    _pipe = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def load_model(self):
        if self._pipe is None:
            print(f"Loading model: {settings.MODEL_ID} on {settings.DEVICE}...")
            
            torch_dtype = torch.float16 if settings.USE_FP16 else torch.float32
            self._pipe = StableDiffusionInpaintPipeline.from_pretrained(
                settings.MODEL_ID,
                torch_dtype=torch_dtype,
                safety_checker=None,
            )
            self._pipe = self._pipe.to(settings.DEVICE)
            
            if settings.USE_FP16 and settings.DEVICE == "cuda":
                try:
                    self._pipe.enable_xformers_memory_efficient_attention()
                except:
                    pass
            
            self._pipe.enable_attention_slicing()
            
            print("Model loaded successfully!")
    
    def unload_model(self):
        if self._pipe is not None:
            del self._pipe
            self._pipe = None
            gc.collect()
            torch.cuda.empty_cache()
    
    @staticmethod
    def _blur_mask(mask_image: Image.Image, blur_radius: int = 8) -> Image.Image:
        mask_gray = mask_image.convert("L")
        mask_array = np.array(mask_gray)
        mask_array = np.where(mask_array > 127, 255, 0).astype(np.uint8)
        mask_blurred = Image.fromarray(mask_array).filter(
            ImageFilter.GaussianBlur(radius=blur_radius)
        )
        return mask_blurred
    
    def enhance_prompt_with_reference(self, prompt: str, reference_image: Optional[Image.Image] = None) -> str:
        if reference_image is None:
            return prompt
        
        style_desc = style_extractor.extract_style_description(reference_image)
        enhanced_prompt = f"{prompt}, {style_desc} style"
        
        print(f"Original prompt: {prompt}")
        print(f"Enhanced prompt: {enhanced_prompt}")
        
        return enhanced_prompt
    
    def generate(
        self,
        image: Image.Image,
        mask_image: Image.Image,
        prompt: str,
        reference_image: Optional[Image.Image] = None,
        num_inference_steps: int = 50,
        guidance_scale: float = 7.5,
        strength: float = 1.0,
        progress_callback: Optional[Callable[[float], None]] = None,
    ) -> Image.Image:
        self.load_model()
        
        image = image.convert("RGB")
        
        mask_smoothed = self._blur_mask(mask_image, blur_radius=8)
        
        enhanced_prompt = self.enhance_prompt_with_reference(prompt, reference_image)
        
        target_size = (512, 512)
        original_size = image.size
        image_resized = image.resize(target_size, Image.LANCZOS)
        mask_resized = mask_smoothed.resize(target_size, Image.LANCZOS)
        
        callback = None
        if progress_callback:
            callback = ProgressCallback(num_inference_steps, progress_callback)
        
        with torch.no_grad():
            result = self._pipe(
                prompt=enhanced_prompt,
                image=image_resized,
                mask_image=mask_resized,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                strength=strength,
                callback=callback,
                callback_steps=1,
            ).images[0]
        
        result = result.resize(original_size, Image.LANCZOS)
        
        del image_resized, mask_resized, mask_smoothed
        gc.collect()
        torch.cuda.empty_cache()
        
        return result

inpainting_service = InpaintingService()
