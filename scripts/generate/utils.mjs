/**
 * ================================================================
 *  HELPERS MODULE – gen-test-babel.mjs
 * ------------------------------------------------
 * ================================================================
 */

import fs from "fs";
import path from "path";
import { parse } from "@babel/parser"; // Babel parser

// LOG FILENAME: Uses globalThis.LOG_FILENAME to allow the log file name
// to be set dynamically by the main script (per execution). If not defined,
// 'debug.log' is used as a fallback.

/* ================================================================

/**
 * Appends a log entry to debug.log in the project root.
 * Serializes objects, supports multiple arguments, and adds a timestamp.
 * Safe for concurrent use in Node.js scripts (e.g., Babel, helpers, etc).
 *
 * Will generate a default log file in the current working directory.
 * If liveMode = true logs will go to: debug_live_TIMESTAMP.log
 * else logs will go to a different file: debug_TIMESTAMP.log.
 * @param  {...any} args - Any values to log (strings, objects, etc)
 * 
 * using globalThis.ISO_EXEC_TIMESTAMP if available for timestamped log filenames
 */
export function writeLog(liveMode = false, ...args) {
	let logFile;
	try {
		// Switch log file depending on liveMode
		// Using global ISO_EXEC_TIMESTAMP if available
		switch (liveMode) {
			case true:
				logFile = `debug_live_${globalThis.ISO_EXEC_TIMESTAMP || 'default'}.log`;
				break;
			default:
				logFile = `debug_${globalThis.ISO_EXEC_TIMESTAMP || 'default'}.log`;
		}

		const logPath = path.join(process.cwd(), logFile);
		const timestamp = new Date().toISOString();
		const message = args.map(a =>
			typeof a === 'string' ? a : JSON.stringify(a, null, 2)
		).join(' ') + '\n';
		fs.appendFileSync(logPath, `\n\n[${timestamp}] ${message}`);
	} catch (err) {
		// Fallback: print to stderr if file write fails
		console.error('writeLog error:', err);
	}
}


/* ================================================================
	UTILITY FUNCTIONS
	--------------------------------------------------------------- */

/**
 * Recursively traverses directories and returns the list of valid files.
 * Now supports baseDir as a string (single path) or array of paths/files.
 */
export function getAllFiles(baseDir, excludeFolders, validExtensions, files = []) {
	switch (true) {

		// Is array
		case Array.isArray(baseDir):
			baseDir.forEach(dir => {
				getAllFiles(dir, excludeFolders, validExtensions, files);
			});
			break;

		// Is single file
		case fs.lstatSync(baseDir).isFile():
			if (validExtensions.includes(path.extname(baseDir))) {
				files.push(baseDir);
			}
			break;

		// Is directory
		default:
			const entries = fs.readdirSync(baseDir, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = path.join(baseDir, entry.name);
				if (entry.isDirectory()) {
					if (!excludeFolders.includes(entry.name)) getAllFiles(fullPath, excludeFolders, validExtensions, files);
				} else if (validExtensions.includes(path.extname(entry.name))) {
					files.push(fullPath);
				}
			}
	}

	// Remove duplicates
	return Array.from(new Set(files));
}

/**
 * Utility: Get today's date in YYYY-MM-DD
 */
export function getToday() {
	return new Date().toISOString().slice(0, 10);
}

/**
 * Utility: Simple diff output (shows lines added)
 */
export function showDiff(original, updated, file) {
	const origLines = original.split('\n');
	const updLines = updated.split('\n');
	console.log(`\n--- ${file} ---`);
	let i = 0, j = 0;
	while (i < origLines.length || j < updLines.length) {
		if (origLines[i] !== updLines[j]) {
			if (updLines[j] && (!origLines[i] || origLines[i] !== updLines[j])) {
				console.log(`+ ${updLines[j]}`);
			}
		}
		i++;
		j++;
	}
	console.log('--- END DIFF ---\n');
}

/**
 * Checks if a line is a normalized (coded) comment (from codeManualComments).
 * @param {string} line
 * @returns {boolean}
 */
export function isCodedComment(line) {
	return typeof line === 'string' && (
		line.trim().startsWith('/****') ||
		line.trim().startsWith('/**') ||
		line.trim().startsWith('//') ||
		line.trim().startsWith('*') ||
		line.trim().startsWith('*/')
	);
}


/**
 * Parsing source code with Babel Parser
*/
export function getParsedSource(code, fileExtension) {

	// Choose Babel plugins
	let plugins = [];

	switch (fileExtension) {
		case ".js":
		case ".jsx":
			plugins = ["jsx"];
			break;
		case ".ts":
			plugins = ["typescript"];
			break;
		case ".tsx":
			plugins = ["jsx", "typescript"];
			break;
		default:
			// fallback: include all common plugins
			plugins = ["jsx", "typescript"];
	}

	// Parse the code to an AST
	const ast = parse(code, {
		sourceType: "module",
		plugins,
	});

	return ast;
}