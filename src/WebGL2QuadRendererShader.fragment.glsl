#version 300 es
precision mediump float;

in vec2 v_uv;
in float v_brightness;
uniform sampler2D u_texture;
out vec4 outColor;

void main() {
	vec4 tex = texture(u_texture, v_uv);
	outColor = vec4(tex.rgb * v_brightness, tex.a);
}
