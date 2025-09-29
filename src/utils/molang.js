import { removeFalsies } from "./arrays.js";
import { floor, max, min } from "./math.js";
import { joinRegExps } from "./misc.js";

/**
 * Converts an item filter into a Molang expression representation.
 * @param {ItemCriteria} itemCriteria
 * @returns {string}
 */
export function itemCriteriaToMolang(itemCriteria, slot = "slot.weapon.mainhand") {
	let names = itemCriteria["names"].map(name => name.includes(":")? name : `minecraft:${name}`);
	let tags = itemCriteria["tags"].map(tag => tag.includes(":")? tag : `minecraft:${tag}`);
	let nameQuery = names.length > 0? `q.is_item_name_any('${slot}',${names.map(name => `'${name}'`).join(",")})` : undefined;
	let tagQuery = tags.length > 0? `q.equipped_item_any_tag('${slot}',${tags.map(tag => `'${tag}'`).join(",")})` : undefined;
	return removeFalsies([nameQuery, tagQuery]).join("||") || "false";
}
/**
 * Creates a Molang expression that mimics array access. Defaults to the last element if nothing is found.
 * @param {any[]} array A continuous array
 * @param {string} indexVar
 * @returns {string}
 */
export function arrayToMolang(array, indexVar) {
	let arrayEntries = Object.entries(array).map(([i, x]) => [+i, x]); // to handle splitting, original indices need to be preserved, hence looking at index-value pairs
	return arrayEntriesToMolang(arrayEntries, indexVar);
}
/**
 * @param {[number, any][]} entries
 * @param {string} indexVar
 * @returns {string}
 */
function arrayEntriesToMolang(entries, indexVar) {
	const splittingThreshold = 10;
	if(entries.length > splittingThreshold) { // large arrays cause Molang stack overflows, so this splits them in half in such a situation.
		let middle = floor(entries.length / 2);
		let lowerMolang = arrayEntriesToMolang(entries.slice(0, middle), indexVar);
		let upperMolang = arrayEntriesToMolang(entries.slice(middle), indexVar);
		let lower = parseInt(lowerMolang) == +lowerMolang? lowerMolang : `(${lowerMolang})`;
		let upper = parseInt(upperMolang) == +upperMolang? upperMolang : `(${upperMolang})`;
		if(lower == upper) {
			return lower;
		}
		return `${indexVar}<${entries[middle][0]}?${lower}:${upper}`;
	}
	let uniqueValues = Array.from(new Set(entries.map(([, value]) => value)));
	let valuesAndIndices = uniqueValues.map(x => [x, entries.filter(([, value]) => value == x).map(([i]) => i)]);
	let lowestIndex = min(...entries.map(([i]) => i));
	let highestIndex = max(...entries.map(([i]) => i));
	let conditionsAndValues = valuesAndIndices.map(([value, indices]) => {
		/** @type {Vec2[]} */
		let intervals = [];
		indices.forEach(i => {
			if(intervals.at(-1)?.[1] == i - 1) {
				intervals.at(-1)[1] = i;
			} else {
				intervals.push([i, i]);
			}
		});
		let intervalConditions = intervals.map(([lower, upper]) => {
			if(lower == upper) {
				return `${indexVar}==${lower}`;
			} else if(lower == lowestIndex && upper == highestIndex) {
				return "true";
			} else if(lower == lowestIndex) {
				return `${indexVar}<${upper + 1}`;
			} else if(upper == highestIndex) {
				return `${indexVar}>${lower - 1}`;
			} else {
				let condition = `${indexVar}>${lower - 1}&&${indexVar}<${upper + 1}`;
				return intervals.length == 1? condition : `(${condition})`; // because min_engine_version is 1.16.0, Molang || always run before &&, so it has to be put inside brackets
			}
		});
		return [intervalConditions.join("||"), value];
	});
	
	// Move the longest condition to the end. Because it's at the end of a ternary condition, we don't have to include the condition, saving characters (and a tiny bit of computation)
	let longestConditionLength = max(...conditionsAndValues.map(([condition]) => condition.length));
	let longestConditionAndValueIndex = conditionsAndValues.findIndex(([condition]) => condition.length == longestConditionLength);
	let longestConditionAndValue = conditionsAndValues[longestConditionAndValueIndex];
	conditionsAndValues.splice(longestConditionAndValueIndex, 1);
	conditionsAndValues.push(longestConditionAndValue);
	
	return conditionsAndValues.map(([condition, value], i) => {
		if(condition == "true" || i == conditionsAndValues.length - 1) {
			return value;
		}
		return `${i > 0? "(" : ""}${condition}?${value}:`;
	}).join("") + ")".repeat(max(conditionsAndValues.length - 2, 0));
}
/**
 * Creates a Molang expression that mimics 2D array access.
 * @param {any[][]} array
 * @param {string} indexVar1
 * @param {string} indexVar2
 * @returns {string}
 */
export function array2DToMolang(array, indexVar1, indexVar2) {
	return arrayToMolang(array.map(subArray => `(${arrayToMolang(subArray, indexVar2)})`), indexVar1);
}

/**
 * Converts a function into minified Molang code. Variables can be referenced with $[...].
 * @param {Function} func
 * @param {Record<string, any>} [vars]
 * @returns {string} Molang code
 */
export function functionToMolang(func, vars = {}) {
	let funcCode = func.toString();
	let minifiedFuncBody = funcCode.slice(funcCode.indexOf("{") + 1, funcCode.lastIndexOf("}")).replaceAll(/\/\/.+/g, "").replaceAll(/(?<!return|let)\s/g, "");
	// else if() {...} statements must be expanded to be else { if() {...} }
	let expandedElseIfCode = "";
	for(let i = 0; i < minifiedFuncBody.length; i++) {
		if(minifiedFuncBody.slice(i, i + 7) == "elseif(") {
			expandedElseIfCode += "else{if(";
			let inIfBlock = false;
			let braceCounter = 0;
			i += 6;
			let j = i;
			for(; braceCounter > 0 || !inIfBlock; j++) {
				if(minifiedFuncBody[j] == "{") {
					braceCounter++;
					inIfBlock = true;
				} else if(minifiedFuncBody[j] == "}") {
					braceCounter--;
				}
				if(braceCounter == 0 && inIfBlock && minifiedFuncBody.slice(j, j + 5) == "}else") {
					inIfBlock = false; // keep the final else clause included
				}
			}
			minifiedFuncBody = minifiedFuncBody.slice(0, j) + "}" + minifiedFuncBody.slice(j);
			continue;
		}
		expandedElseIfCode += minifiedFuncBody[i];
	}
	let mathedCode = expandedElseIfCode
		.replaceAll(`"`, `'`)
		.replaceAll(/([\w\.]+)(\+|-){2};/g, "$1=$1$21;") // x++ and x-- -> x=x+1 and x=x-1
		.replaceAll(/([\w\.\$\[\]]+)(\+|-|\*|\/|\?\?|%)=([^;]+);/g, "$1=$1$2$3;") // x += y -> x=x+y for +, -, *, /, ??, %
		.replaceAll(/([\w\.]+)%(-?\d+)/g, "math.mod($1,$2)")
		.replaceAll(/\(([^()]+|[^()]*\([^()]+\)[^()]*)\)%(-?\d+)/g, "math.mod($1,$2)")
		.replaceAll("return;", "return 0;"); // complex Molang expressions can't return nothing
	
	// I have no idea how to make this smaller. I really wish JS had a native AST conversion API
	let conditionedCode = "";
	let parenthesisCounter = 0;
	let inIfCondition = false;
	let needsExtraBracketAtEndOfIfCondition = false; // short variable names are for slow typers :)
	for(let i = 0; i < mathedCode.length; i++) {
		let char = mathedCode[i];
		if(mathedCode.slice(i, i + 3) == "if(") {
			inIfCondition = true;
			parenthesisCounter++;
			needsExtraBracketAtEndOfIfCondition = /^if\([^()]+\?\?/.test(mathedCode.slice(i)); // null coalescing operator is the only operator with lower precedence than the ternary conditional operator, so if a conditional expression in if() has ?? without any brackets around it, brackets are needed around the entire conditional expression
			if(needsExtraBracketAtEndOfIfCondition) {
				conditionedCode += "(";
			}
			i += 2;
			continue;
		} else if(mathedCode.slice(i, i + 4) == "else") {
			conditionedCode = conditionedCode.slice(0, -1) + ":"; // replace the ; with :
			i += 3;
			continue;
		} else if(/^for\([^)]+\)/.test(mathedCode.slice(i))) {
			let forStatement = substituteVariablesIntoMolang(mathedCode.slice(i).match(/^for\([^)]+\)/)[0], vars);
			let [, forVarName, initialValue, upperBound] = forStatement.match(/^for\(let (\w+)=(\d+);\w+<(\d+);\w+\+\+\)/);
			let forBlockStartI = mathedCode.slice(i).indexOf("{") + i;
			let forBlockEndI = forBlockStartI + 1;
			let braceCounter = 1;
			while(braceCounter > 0) {
				if(mathedCode[forBlockEndI] == "{") {
					braceCounter++;
				} else if(mathedCode[forBlockEndI] == "}") {
					braceCounter--;
				}
				forBlockEndI++;
			}
			let forBlockContent = mathedCode.slice(forBlockStartI + 1, forBlockEndI - 1);
			let expandedForCode = "";
			for(let forI = +initialValue; forI < +upperBound; forI++) {
				expandedForCode += substituteVariablesIntoMolang(forBlockContent, {
					...vars,
					...{
						[forVarName]: forI
					}
				});
			}
			mathedCode = mathedCode.slice(0, i) + expandedForCode + mathedCode.slice(forBlockEndI);
			i--;
			continue;
		} else if(char == "(") {
			parenthesisCounter++;
		} else if(char == ")") {
			parenthesisCounter--;
			if(parenthesisCounter == 0 && inIfCondition) {
				inIfCondition = false;
				if(needsExtraBracketAtEndOfIfCondition) {
					conditionedCode += ")";
				}
				conditionedCode += "?";
				continue;
			}
		} else if(char == "}") {
			conditionedCode += "};";
			continue;
		}
		conditionedCode += char;
	}
	let variabledCode = substituteVariablesIntoMolang(conditionedCode, vars);
	let tempVariabledCode = convertJSVariablesToMolangTemps(variabledCode);
	let deadBranchRemovedCode = removeDeadMolangBranches(tempVariabledCode);
	return deadBranchRemovedCode;
}
/**
 * Substitutes variables into Molang code. Variables must be written as `$[varName]`.
 * @param {string} code
 * @param {Record<string, any>} vars
*/
function substituteVariablesIntoMolang(code, vars) {
	// Yay more fun regular expressions, this time to work with variable substitution ($[...])
	return code.replaceAll(/\$\[(\w+)(?:\[(\d+)\]|\.(\w+))?(?:(\+|-|\*|\/)(\d+))?\]/g, (_, varName, index, key, operator, operand) => {
		if(varName in vars) {
			let value = vars[varName];
			index ??= key;
			if(index != undefined) {
				if(index in value) {
					value = value[index];
				} else {
					throw new RangeError(`Index out of bounds: [${value.join(", ")}][${index}] does not exist`);
				}
			}
			switch(operator) {
				case "+": return +value + +operand; // must cast operands to numbers to avoid string concatenation
				case "-": return value - operand;
				case "*": return value * operand;
				case "/": return value / operand;
				default: return value;
			}
		} else {
			throw new ReferenceError(`Variable "${varName}" was not passed to function -> Molang converter!`);
		}
	});
}
/**
 * Converts JavaScript variables in Molang code (e.g. `let x = 42;`) into proper temp variables (e.g. `t.loc_1234 = 42;`).
 * @param {string} code
 * @returns {string}
 */
function convertJSVariablesToMolangTemps(code) {
	let variableNames = Array.from(code.matchAll(/\blet (\w+)/gm)).map(([, varName]) => varName);
	let counter = 0;
	let uniqueVariableNames = new Set(variableNames);
	uniqueVariableNames.forEach(varName => {
		let tempVarName = `t._${counter++}`;
		code = code.replaceAll(joinRegExps(/(?<!\.)\b(let )?/, varName, /\b/g), tempVarName);
	});
	return code;
}
/**
 * Removes dead branches from Molang code, only if the condition is explicitly true or false.
 * @param {string} code
 * @returns {string}
 */
function removeDeadMolangBranches(code) {
	for(let i = 0; i < code.length; i++) {
		if(code.slice(i, i + 7) == "false?{") {
			let j = i + 7;
			let braceCounter = 1;
			let elseBlockStart = -1;
			while(braceCounter || code[j] != ";") {
				if(code[j] == "{") braceCounter++;
				else if(code[j] == "}") braceCounter--;
				if(braceCounter == 0 && code[j] == ":") {
					elseBlockStart = j + 2;
				}
				j++;
			}
			let elseBlock = elseBlockStart > -1? code.slice(elseBlockStart, j - 1) : "";
			code = code.slice(0, i) + elseBlock + code.slice(j + 1);
			i--;
		} else if(code.slice(i, i + 6) == "true?{") {
			let j = i + 6;
			let braceCounter = 1;
			let trueBlockEnd;
			while(braceCounter || code[j] != ";") {
				if(code[j] == "{") braceCounter++;
				else if(code[j] == "}") braceCounter--;
				if(braceCounter == 0 && code[j] == ":") {
					trueBlockEnd = j;
				}
				j++;
			}
			trueBlockEnd ??= j;
			code = code.slice(0, i) + code.slice(i + 6, trueBlockEnd - 1) + code.slice(j + 1);
			i--;
		}
	}
	return code;
}

/** @import { ItemCriteria, Vec2 } from "../HoloPrint.js" */