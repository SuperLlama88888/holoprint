import { jsonc } from "./conversions.js";

let translationLanguages = {};
export async function loadTranslationLanguage(language) {
	translationLanguages[language] ??= await fetch(`translations/${language}.json`).then(res => jsonc(res)).catch(() => {
		console.warn(`Failed to load language ${language} for translations!`);
		return {};
	});
}
/**
 * Looks up a translation from translations/`language`.json
 * @param {string} translationKey
 * @param {string} language
 * @returns {string | undefined}
 */
export function translate(translationKey, language) {
	if(!(language in translationLanguages)) {
		console.error(`Language ${language} not loaded for translation!`);
		return undefined;
	}
	return translationLanguages[language][translationKey]?.replaceAll(/`([^`]+)`/g, "<code>$1</code>")?.replaceAll(/\[([^\]]+)\]\(([^\)]+)\)/g, `<a href="$2" target="_blank">$1</a>`);
}