Shader "VirtualProduction/ChromaKey"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "white" {}
        _KeyColor ("Key Color", Color) = (0, 1, 0, 1)
        _Threshold ("Threshold", Range(0, 1)) = 0.5
        _Tolerance ("Tolerance", Range(0, 1)) = 0.2
        _SpillSuppression ("Spill Suppression", Range(0, 1)) = 0.5
        _EdgeSoftness ("Edge Softness", Range(0, 0.1)) = 0.01
        _DespillStrength ("Despill Strength", Range(0, 2)) = 1.0
        _AlphaClip ("Alpha Clip", Range(0, 1)) = 0.0
    }

    SubShader
    {
        Tags
        {
            "Queue" = "Transparent"
            "IgnoreProjector" = "True"
            "RenderType" = "Transparent"
        }

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
            float4 _MainTex_TexelSize;
            float4 _KeyColor;
            float _Threshold;
            float _Tolerance;
            float _SpillSuppression;
            float _EdgeSoftness;
            float _DespillStrength;
            float _AlphaClip;

            v2f vert(appdata v)
            {
                v2f o;
                o.vertex = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                return o;
            }

            float rgbToY(float3 c)
            {
                return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
            }

            float rgbToCb(float3 c)
            {
                return -0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b + 0.5;
            }

            float rgbToCr(float3 c)
            {
                return 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b + 0.5;
            }

            float3 rgbToHsv(float3 c)
            {
                float4 K = float4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
                float4 p = lerp(float4(c.bg, K.wz), float4(c.gb, K.xy), step(c.b, c.g));
                float4 q = lerp(float4(p.xyw, c.r), float4(c.r, p.yzx), step(p.x, c.r));

                float d = q.x - min(q.w, q.y);
                float e = 1.0e-10;

                float h = abs(q.z + (q.w - q.y) / (6.0 * d + e));
                float s = d / (q.x + e);
                float v = q.x;

                return float3(h, s, v);
            }

            float CalculateChromaDistance(float3 col, float3 key)
            {
                float keyCb = rgbToCb(key);
                float keyCr = rgbToCr(key);

                float cb = rgbToCb(col);
                float cr = rgbToCr(col);

                float cbDiff = cb - keyCb;
                float crDiff = cr - keyCr;

                return sqrt(cbDiff * cbDiff + crDiff * crDiff);
            }

            float CalculateSaturation(float3 col)
            {
                float maxC = max(max(col.r, col.g), col.b);
                float minC = min(min(col.r, col.g), col.b);
                float l = (maxC + minC) * 0.5;

                if (maxC == minC)
                    return 0.0;

                float d = maxC - minC;
                return l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
            }

            fixed4 frag(v2f i) : SV_Target
            {
                fixed4 col = tex2D(_MainTex, i.uv);

                float chromaDist = CalculateChromaDistance(col.rgb, _KeyColor.rgb);

                float softThreshold = _Threshold;
                float softTolerance = max(_Tolerance, _EdgeSoftness);

                float rawAlpha = 1.0 - smoothstep(
                    softThreshold - softTolerance,
                    softThreshold + softTolerance,
                    chromaDist);

                float edgeAlpha = 1.0 - smoothstep(
                    _Threshold - _EdgeSoftness,
                    _Threshold + _EdgeSoftness,
                    chromaDist);

                float saturation = CalculateSaturation(col.rgb);
                float luminance = rgbToY(col.rgb);

                float greenDominance = col.g - max(col.r, col.b);
                float keyGreenDominance = _KeyColor.g - max(_KeyColor.r, _KeyColor.b);

                float similarityToKey = 1.0 - abs(greenDominance - keyGreenDominance);
                similarityToKey = saturate(similarityToKey);

                float finalAlpha = lerp(rawAlpha, edgeAlpha, similarityToKey * 0.5);
                finalAlpha = max(finalAlpha, step(_AlphaClip, finalAlpha));

                float3 hsv = rgbToHsv(col.rgb);
                float keyHue = rgbToHsv(_KeyColor.rgb).x;

                float hueDiff = abs(hsv.x - keyHue);
                hueDiff = min(hueDiff, 1.0 - hueDiff) * 2.0;

                float3 spillRemoved = col.rgb;
                float spillAmount = greenDominance * _DespillStrength;

                float3 spillColor = float3(0.0, spillAmount, 0.0);

                float edgeRegion = 1.0 - saturate(abs(finalAlpha - 0.5) * 2.0);
                float spillFactor = edgeRegion * _SpillSuppression * (1.0 - finalAlpha);

                spillRemoved -= spillColor * spillFactor;
                spillRemoved = max(spillRemoved, 0.0);

                float lumaFactor = saturate(luminance * 2.0);
                float3 desaturated = dot(spillRemoved, float3(0.299, 0.587, 0.114));

                float3 edgeColor = lerp(desaturated, spillRemoved, 1.0 - edgeRegion * 0.3);
                spillRemoved = lerp(spillRemoved, edgeColor, edgeRegion * 0.2);

                float premultipliedAlpha = finalAlpha;
                spillRemoved *= premultipliedAlpha;
                spillRemoved = max(spillRemoved, 0.0);

                return fixed4(spillRemoved, finalAlpha);
            }
            ENDCG
        }
    }
    FallBack "Diffuse"
}
