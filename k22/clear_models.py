#!/usr/bin/env python
import os
import shutil
import sys

def clear_models():
    model_dir = "models"
    if os.path.exists(model_dir):
        print(f"Removing old model files from {model_dir}/ ...")
        for file in os.listdir(model_dir):
            file_path = os.path.join(model_dir, file)
            if os.path.isfile(file_path):
                os.remove(file_path)
                print(f"  Removed: {file}")
        print("Old models cleared. Models will be retrained on next startup.")
    else:
        print(f"Model directory {model_dir}/ does not exist. Nothing to clear.")

if __name__ == "__main__":
    clear_models()
