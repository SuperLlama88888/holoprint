// Simple logger.
import { ceil, downloadBlob, getStackTrace, html } from "../essential.js";

export default class SimpleLogger extends HTMLElement {
	#originTime;
	
	node;
	allLogs = [];
	
	#errorCount;
	#warningCount;
	
	#errorCountNode;
	#warningCountNode;
	
	constructor() {
		super();
		this.attachShadow({
			mode: "open"
		});
	}
	connectedCallback() {
		this.shadowRoot.innerHTML = html`
			<style>
				#root {
					margin: 15px;
					display: block;
					color: white;
					font-family: monospace;
					font-size: 14px;
					max-height: 300px;
					overflow: auto;
					text-align: left;
					position: relative;
				}
				.logHeader {
					padding: 2px 2px 2px 12px;
					position: sticky;
					top: 0;
					height: 20px;
					background: #556;
				}
				.logHeader * {
					margin-left: 30px;
				}
				#downloadLogsButton {
					background: inherit;
					border: 1px solid #CCC;
					border-radius: 7px;
					color: white;
					float: right;
					box-sizing: border-box;
					cursor: pointer;
					font: inherit;
				}
				#downloadLogsButton:hover {
					background: #4D4D5D;
				}
				#downloadLogsButton:active {
					background: #445;
				}
				.log {
					margin: 0;
					padding: 2px 12px;
					background: #223;
					overflow-wrap: break-word;
				}
				.log:nth-child(2n) {
					background: #334;
				}
				.warning > .logText::before {
					content: "⚠️";
				}
				.error > .logText::before {
					content: "🚨";
				}
				.info > .logText::before {
					content: "ℹ️";
				}
				.timestamp {
					margin-right: 5px;
					padding: 0 2px;
					background: #556;
					color: #CCC;
				}
			</style>
			<div id="root">
				<div class="logHeader">Logs<span id="errorCount">\u{1F6A8}0</span><span id="warningCount">\u26A0\uFE0F0</span><button type="button" id="downloadLogsButton">Download logs</button></div>
			</div>
		`;
		this.node = this.shadowRoot.selectEl("#root");
		this.node.selectEl("#downloadLogsButton").onEvent("click", () => {
			downloadBlob(new Blob([JSON.stringify(this.allLogs)]), "holoprint_logs.json");
		});
		this.#warningCountNode = this.node.selectEl("#warningCount");
		this.#errorCountNode = this.node.selectEl("#errorCount");
		
		this.#errorCount = 0;
		this.#warningCount = 0;
		
		this.#originTime = performance.now();
	}
	warn(text) {
		if(this.#genericLogWithClass(text, "warning")) {
			this.#warningCountNode.innerText = `\u26A0\uFE0F${++this.#warningCount}`;
		}
	}
	error(text) {
		if(this.#genericLogWithClass(text, "error")) {
			this.#errorCountNode.innerText = `\u{1F6A8}${++this.#errorCount}`;
		}
	}
	info(text) {
		this.#genericLogWithClass(text, "info");
	}
	debug(text) {
		this.#genericLogWithClass(text, "debug");
	}
	setOriginTime(originTime) {
		this.#originTime = originTime;
	}
	#genericLogWithClass(text, logLevel) {
		let stackTrace = getStackTrace().slice(2);
		this.allLogs.push({
			text,
			level: logLevel,
			stackTrace,
			time: performance.now() - this.#originTime
		});
		if(logLevel == "debug") {
			return;
		}
		let currentURLOrigin = location.href.slice(0, location.href.lastIndexOf("/")); // location.origin is null on Firefox when on local files
		if(stackTrace.some(loc => /https?:\/\//.test(loc) && !loc.includes(currentURLOrigin) && !loc.includes("<anonymous>"))) {
			return;
		}
		let el = document.createElement("p");
		el.classList.add("log");
		if(logLevel) {
			el.classList.add(logLevel);
		}
		let timestamp = this.#createTimestamp();
		el.appendChild(timestamp);
		let textSpan = document.createElement("span");
		textSpan.classList.add("logText");
		textSpan.innerText = text;
		el.appendChild(textSpan);
		let shouldScrollToBottom = ceil(this.node.scrollTop + this.node.getBoundingClientRect().height) >= this.node.scrollHeight;
		this.node.appendChild(el);
		if(shouldScrollToBottom) {
			this.node.scrollTop = this.node.scrollHeight;
		}
		return true;
	}
	#createTimestamp() {
		let el = document.createElement("span");
		el.classList.add("timestamp");
		let d = new Date(performance.now() - this.#originTime);
		let text = `${d.getUTCMinutes().toString().padStart(2, "0")}:${d.getUTCSeconds().toString().padStart(2, "0")}.${d.getUTCMilliseconds().toString().padStart(3, "0")}`;
		if(d.getUTCHours() > 0) {
			text = `${d.getUTCHours().toString().padStart(2, "0")}:${text}`
		}
		el.innerText = text;
		return el;
	}
	
	patchConsoleMethods() {
		[console._warn, console._error, console._info, console._debug] = [console.warn, console.error, console.info, console.debug];
		console.warn = (...args) => {
			this.warn(args.join(" "));
			return console._warn.apply(console, [getStackTrace()[1].match(/\/([^\/]+\.[^\.]+:\d+:\d+)/)[1] + "\n", ...args]);
		};
		console.error = (...args) => {
			this.error(args.join(" "));
			return console._error.apply(console, [getStackTrace()[1].match(/\/([^\/]+\.[^\.]+:\d+:\d+)/)[1] + "\n", ...args]);
		};
		console.info = (...args) => {
			this.info(args.join(" "));
			return console._info.apply(console, [getStackTrace()[1].match(/\/([^\/]+\.[^\.]+:\d+:\d+)/)[1] + "\n", ...args]);
		};
		console.debug = (...args) => {
			this.debug(args.join(" "));
			return console._debug.apply(console, [getStackTrace()[1].match(/\/([^\/]+\.[^\.]+:\d+:\d+)/)[1] + "\n", ...args]);
		};
	}
}