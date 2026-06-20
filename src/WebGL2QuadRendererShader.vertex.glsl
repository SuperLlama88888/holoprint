#version 300 es

in vec2 a_position;
in vec2 a_uv;
out vec2 v_uv;

void main() {
	vec2 clipSpace = (a_position * 2.) - 1.; // maps coordinates: [0, 1] -> [-1, 1]
	gl_Position = vec4(clipSpace * vec2(1., -1.), 0., 1.);
	v_uv = a_uv;
}
