import { dispatchInputEvents, flattenObject, html, onEvent, reduceProperties, selectEl, selectEls } from "../utils.js";

/** A custom input with three number inputs which must be assigned to the x, y, and z slots. */
export default class Vec3Input extends HTMLElement {
	static formAssociated = true;
	
	internals;
	
	#connected = false;
	/** @type {HTMLFormElement} */
	#form;
	/** @type {[HTMLInputElement, HTMLInputElement, HTMLInputElement]} */
	#inputs;
	#canSetInputValues = false;
	
	constructor() {
		super();
		this.attachShadow({
			mode: "open"
		});
		this.internals = this.attachInternals();
	}
	connectedCallback() {
		if(this.#connected) {
			return;
		}
		this.#connected = true;
		
		this.tabIndex = 0;
		this.shadowRoot.innerHTML = html`
			<form>
				<slot name="x"></slot> / <slot name="y"></slot> / <slot name="z"></slot>
			</form>
		`;
		this.#form = this.shadowRoot[selectEl]("form");
		// @ts-expect-error
		this.#inputs = Array.from(this.shadowRoot[selectEls]("slot")).map(el => el.assignedElements()[0]);
		if(this.#inputs.length != 3 || !this.#inputs.every(input => input instanceof HTMLInputElement)) {
			throw new Error("Vec3Input elements must have exactly 3 slotted <input> elements!");
		}
		let nativeValueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
		this.#inputs.forEach(input => {
			input[onEvent]("input", () => this.#reportFormState());
			Object.defineProperty(input, "value", {
				get: nativeValueDescriptor.get,
				set: value => {
					if(this.#canSetInputValues) {
						nativeValueDescriptor.set.call(input, value);
					}
				}
			});
		});
		this[onEvent]("focus", () => {
			this.#inputs[0].focus();
		});
		this.#reportFormState();
	}
	formResetCallback() {
		this.#form.reset();
		this.value = this.getAttribute("default") ?? ",,";
	}
	get form() {
		return this.internals.form;
	}
	get name() {
		return this.getAttribute("name");
	}
	get type() {
		return this.localName;
	}
	get value() {
		return this.#inputs.map(input => input.value).join(",");
	}
	set value(stringifiedValue) {
		let values = stringifiedValue.split(",").map(x => +x);
		this.#canSetInputValues = true;
		[this.x, this.y, this.z] = values;
		this.#canSetInputValues = false;
	}
	
	get x() {
		return +this.#inputs[0].value;
	}
	set x(x) {
		this.#canSetInputValues = true;
		this.#inputs[0].value = String(x);
		this.#canSetInputValues = false;
		dispatchInputEvents(this.#inputs[0]);
	}
	get y() {
		return +this.#inputs[1].value;
	}
	set y(y) {
		this.#canSetInputValues = true;
		this.#inputs[1].value = String(y);
		this.#canSetInputValues = false;
		dispatchInputEvents(this.#inputs[1]);
	}
	get z() {
		return +this.#inputs[2].value;
	}
	set z(z) {
		this.#canSetInputValues = true;
		this.#inputs[2].value = String(z);
		this.#canSetInputValues = false;
		dispatchInputEvents(this.#inputs[2]);
	}
	/** @returns {Vec3} */
	get xyz() {
		return [this.x, this.y, this.z];
	}
	/** @param {Vec3 | I32Vec3} xyz */
	set xyz(xyz) {
		[this.x, this.y, this.z] = xyz;
	}
	
	#reportFormState() {
		this.internals.setFormValue(this.value);
		let validities = this.#inputs.map(input => flattenObject(input.validity));
		validities.forEach(validity => delete validity.valid);
		let overallValidity = reduceProperties(validities, (a, b) => a || b);
		if(Object.values(overallValidity).some(x => x)) {
			let invalidInputIndex = validities.findIndex(validity => Object.values(validity).some(x => x));
			let invalidInput = this.#inputs[invalidInputIndex];
			this.internals.setValidity(overallValidity, invalidInput.validationMessage, invalidInput);
		} else {
			this.internals.setValidity({});
		}
	}
}

/** @import { I32Vec3, Vec3 } from "../HoloPrint.js" */