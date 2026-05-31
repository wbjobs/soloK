Shader "VirtualProduction/DepthOfField"
{
    Properties
    {
        _MainTex ("Base (RGB)", 2D) = "white" {}
        _CoCTex ("Circle of Confusion", 2D) = "black" {}
    }

    CGINCLUDE
    #include "UnityCG.cginc"

    sampler2D _MainTex;
    sampler2D _CoCTex;
    sampler2D _CameraDepthTexture;
    float4 _MainTex_TexelSize;

    float _FocusDistance;
    float _FStop;
    float _FocalLength;
    float _BokehScale;

    struct v2f
    {
        float4 pos : SV_POSITION;
        float2 uv : TEXCOORD0;
    };

    v2f vert(appdata_img v)
    {
        v2f o;
        o.pos = UnityObjectToClipPos(v.vertex);
        o.uv = v.texcoord;
        return o;
    }

    float ComputeCoC(float depth)
    {
        float near = _ProjectionParams.y;
        float far = _ProjectionParams.z;
        float linearDepth = LinearEyeDepth(depth);

        float coc = abs((_FocalLength * _FocalLength * (linearDepth - _FocusDistance)) /
                        (_FStop * _FocusDistance * (linearDepth - _FocalLength)));

        coc = clamp(coc * _BokehScale, 0.0, 1.0);
        return coc;
    }

    float4 fragCoC(v2f i) : SV_Target
    {
        float depth = SAMPLE_DEPTH_TEXTURE(_CameraDepthTexture, i.uv);
        float coc = ComputeCoC(depth);
        return float4(coc, coc, coc, 1.0);
    }

    float4 fragBlur(v2f i) : SV_Target
    {
        float4 coc = tex2D(_CoCTex, i.uv);
        float blurRadius = coc.r * _BokehScale * 10.0;

        float4 color = float4(0, 0, 0, 0);
        float totalWeight = 0.0;

        int samples = 12;
        for (int j = 0; j < samples; j++)
        {
            float angle = j * 6.28318 / samples;
            for (int r = 1; r <= 3; r++)
            {
                float2 offset = float2(cos(angle), sin(angle)) * _MainTex_TexelSize.xy * blurRadius * r;
                float4 sampleColor = tex2D(_MainTex, i.uv + offset);
                float weight = 1.0 - (r / 4.0);
                color += sampleColor * weight;
                totalWeight += weight;
            }
        }

        return color / totalWeight;
    }

    float4 fragComposite(v2f i) : SV_Target
    {
        float4 original = tex2D(_MainTex, i.uv);
        float4 blurred = tex2D(_MainTex, i.uv);
        float4 coc = tex2D(_CoCTex, i.uv);

        float blurAmount = coc.r;
        return lerp(original, blurred, blurAmount);
    }
    ENDCG

    SubShader
    {
        Pass
        {
            ZTest Always Cull Off ZWrite Off
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment fragCoC
            ENDCG
        }

        Pass
        {
            ZTest Always Cull Off ZWrite Off
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment fragBlur
            ENDCG
        }

        Pass
        {
            ZTest Always Cull Off ZWrite Off
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment fragComposite
            ENDCG
        }
    }
    FallBack Off
}
