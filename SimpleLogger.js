// Simple logger.
import { ceil, downloadBlob, getStackTrace } from "./essential.js";

export default class SimpleLogger {
	#originTime;
	
	node;
	allLogs = [];
	
	#errorCount;
	#warningCount;
	
	#errorCountNode;
	#warningCountNode;
	
	constructor(node) {
		this.node = node;
		this.node.classList.add("simpleLogger");
		
		let logHeader = document.createElement("div");
		logHeader.classList.add("logHeader");
		logHeader.innerText = "Logs";
		this.#errorCountNode = document.createElement("span");
		this.#errorCountNode.innerText = "\u{1F6A8}0";
		logHeader.appendChild(this.#errorCountNode);
		this.#warningCountNode = document.createElement("span");
		this.#warningCountNode.innerText = "\u26A0\uFE0F0";
		logHeader.appendChild(this.#warningCountNode);
		let downloadLogsButton = document.createElement("button");
		downloadLogsButton.innerText = "Download all logs";
		downloadLogsButton.setAttribute("type", "button");
		downloadLogsButton.onEvent("click", () => {
			downloadBlob(new Blob([JSON.stringify(this.allLogs)]), "holoprint_logs.json");
		});
		logHeader.appendChild(downloadLogsButton);
		this.node.appendChild(logHeader);
		
		this.#errorCount = 0;
		this.#warningCount = 0;
		
		this.#originTime = performance.now();
		if(!document.querySelector(`link[href="SimpleLogger.css"]`)) {
			let l = document.createElement("link");
			l.rel = "stylesheet";
			l.href = "SimpleLogger.css";
			document.head.appendChild(l);
		}
	}
	log(text) {
		this.#genericLogWithClass(text);
	}
	warn(text) {
		this.#genericLogWithClass(text, "warning");
		this.#warningCountNode.innerText = `\u26A0\uFE0F${++this.#warningCount}`;
	}
	error(text) {
		this.#genericLogWithClass(text, "error");
		this.#errorCountNode.innerText = `\u{1F6A8}${++this.#errorCount}`;
	}
	info(text) {
		this.#genericLogWithClass(text, "info");
	}
	setOriginTime(originTime) {
		this.#originTime = originTime;
	}
	#genericLogWithClass(text, logLevel) {
		let stackTrace = getStackTrace().slice(2);
		this.allLogs.push({
			text,
			level: logLevel,
			stackTrace
		});
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
		[console._warn, console._error, console._info] = [console.warn, console.error, console.info];
		console.warn = (...args) => {
			this.warn(...args);
			return console._warn.apply(console, [getStackTrace()[1].match(/\/([^\/]+\.[^\.]+:\d+:\d+)/)[1] + "\n", ...args]);
		};
		console.error = (...args) => {
			this.error(...args);
			return console._error.apply(console, [getStackTrace()[1].match(/\/([^\/]+\.[^\.]+:\d+:\d+)/)[1] + "\n", ...args]);
		};
		console.info = (...args) => {
			this.info(...args);
			return console._info.apply(console, [getStackTrace()[1].match(/\/([^\/]+\.[^\.]+:\d+:\d+)/)[1] + "\n", ...args]);
		};
	}
}