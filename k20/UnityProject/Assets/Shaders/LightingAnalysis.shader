Shader "VirtualProduction/LightingAnalysis"
{
    Properties
    {
        _MainTex ("Source Texture", 2D) = "white" {}
        _BrightnessThreshold ("Brightness Threshold", Range(0, 1)) = 0.7
        _ShadowThreshold ("Shadow Threshold", Range(0, 1)) = 0.3
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" }
        LOD 100

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float2 uv : TEXCOORD0;
                float4 vertex : SV_POSITION;
            };

            sampler2D _MainTex;
            float4 _MainTex_ST;
            float _BrightnessThreshold;
            float _ShadowThreshold;

            v2f vert(appdata v)
            {
                v2f o;
                o.vertex = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                return o;
            }

            float3 RgbToHsv(float3 c)
            {
                float4 K = float4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
                float4 p = lerp(float4(c.bg, K.wz), float4(c.gb, K.xy), step(c.b, c.g));
                float4 q = lerp(float4(p.xyw, c.r), float4(c.r, p.yzx), step(p.x, c.r));

                float d = q.x - min(q.w, q.y);
                float e = 1.0e-10;
                return float3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
            }

            float4 frag(v2f i) : SV_Target
            {
                float4 col = tex2D(_MainTex, i.uv);

                float luminance = dot(col.rgb, float3(0.299, 0.587, 0.114));

                float3 hsv = RgbToHsv(col.rgb);

                float isBright = step(_BrightnessThreshold, luminance);
                float isShadow = step(luminance, _ShadowThreshold);

                float2 direction = (i.uv - 0.5) * 2.0;
                float dirMagnitude = length(direction);
                float3 lightDir = float3(direction.x, 1.0 - dirMagnitude, direction.y);
                lightDir = normalize(lightDir);

                float4 result;
                result.rgb = col.rgb;
                result.a = luminance;

                return result;
            }
            ENDCG
        }
    }
    FallBack "Diffuse"
}
