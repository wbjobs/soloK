Shader "VirtualProduction/VideoTransition"
{
    Properties
    {
        _PrevTex ("Previous Texture", 2D) = "white" {}
        _NextTex ("Next Texture", 2D) = "white" {}
        _Progress ("Progress", Range(0, 1)) = 0
        _Mode ("Transition Mode", Int) = 0
    }

    SubShader
    {
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _PrevTex;
            sampler2D _NextTex;
            float _Progress;
            int _Mode;

            fixed4 frag(v2f_img i) : SV_Target
            {
                float2 uv = i.uv;
                float4 prevColor = tex2D(_PrevTex, uv);
                float4 nextColor = tex2D(_NextTex, uv);

                switch (_Mode)
                {
                    case 0:
                        return lerp(prevColor, nextColor, _Progress);

                    case 1:
                        return uv.x < _Progress ? nextColor : prevColor;

                    case 2:
                        return uv.x > 1 - _Progress ? nextColor : prevColor;

                    case 3:
                        return uv.y < _Progress ? nextColor : prevColor;

                    case 4:
                        return uv.y > 1 - _Progress ? nextColor : prevColor;

                    default:
                        return lerp(prevColor, nextColor, _Progress);
                }
            }
            ENDCG
        }
    }
    FallBack Off
}
