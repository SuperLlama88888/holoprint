// for whatever reason this can't live in the root folder
declare module "*.glsl" {
	const content: string;
	export default content;
}