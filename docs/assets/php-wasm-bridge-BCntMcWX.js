var Module = (() => {
	var _scriptName = import.meta.url;

	return function (moduleArg = {}) {
		var moduleRtn;

		// include: shell.js
		// The Module object: Our interface to the outside world. We import
		// and export values on it. There are various ways Module can be used:
		// 1. Not defined. We create it here
		// 2. A function parameter, function(moduleArg) => Promise<Module>
		// 3. pre-run appended it, var Module = {}; ..generated code..
		// 4. External script tag defines var Module.
		// We need to check if Module already exists (e.g. case 3 above).
		// Substitution will be replaced with actual code on later stage of the build,
		// this way Closure Compiler will not mangle it (e.g. case 4. above).
		// Note that if you want to run closure, and also to use Module
		// after the generated code, you will need to define   var Module = {};
		// before the code. Then that object will be used in the code, and you
		// can continue to use Module afterwards as well.
		var Module = moduleArg;

		// Set up the promise that indicates the Module is initialized
		var readyPromiseResolve, readyPromiseReject;
		var readyPromise = new Promise((resolve, reject) => {
			readyPromiseResolve = resolve;
			readyPromiseReject = reject;
		});
		[
			"_memory",
			"_php_wasm_run",
			"___indirect_function_table",
			"onRuntimeInitialized",
		].forEach((prop) => {
			if (!Object.getOwnPropertyDescriptor(readyPromise, prop)) {
				Object.defineProperty(readyPromise, prop, {
					get: () =>
						abort(
							"You are getting " +
								prop +
								" on the Promise object, instead of the instance. Use .then() to get called back with the instance, see the MODULARIZE docs in src/settings.js",
						),
					set: () =>
						abort(
							"You are setting " +
								prop +
								" on the Promise object, instead of the instance. Use .then() to get called back with the instance, see the MODULARIZE docs in src/settings.js",
						),
				});
			}
		});

		// Determine the runtime environment we are in. You can customize this by
		// setting the ENVIRONMENT setting at compile time (see settings.js).

		var ENVIRONMENT_IS_WEB = true;
		var ENVIRONMENT_IS_WORKER = false;
		var ENVIRONMENT_IS_NODE = false;
		var ENVIRONMENT_IS_SHELL = false;

		// --pre-jses are emitted after the Module integration code, so that they can
		// refer to Module (if they choose; they can also define Module)

		// Sometimes an existing Module object exists with properties
		// meant to overwrite the default module functionality. Here
		// we collect those properties and reapply _after_ we configure
		// the current environment's defaults to avoid having to be so
		// defensive during initialization.
		var moduleOverrides = Object.assign({}, Module);

		var arguments_ = [];
		var thisProgram = "./this.program";
		var quit_ = (status, toThrow) => {
			throw toThrow;
		};

		// `/` should be present at the end if `scriptDirectory` is not empty
		var scriptDirectory = "";
		function locateFile(path) {
			if (Module["locateFile"]) {
				return Module["locateFile"](path, scriptDirectory);
			}
			return scriptDirectory + path;
		}

		// Hooks that are implemented differently in different runtime environments.
		var readAsync, readBinary;

		if (ENVIRONMENT_IS_SHELL) {
			if (
				(typeof process == "object" && typeof require === "function") ||
				typeof window == "object" ||
				typeof WorkerGlobalScope != "undefined"
			)
				throw new Error(
					"not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)",
				);
		}

		// Note that this includes Node.js workers when relevant (pthreads is enabled).
		// Node.js workers are detected as a combination of ENVIRONMENT_IS_WORKER and
		// ENVIRONMENT_IS_NODE.
		else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
			if (ENVIRONMENT_IS_WORKER) {
				// Check worker, not web, since window could be polyfilled
				scriptDirectory = self.location.href;
			} else if (typeof document != "undefined" && document.currentScript) {
				// web
				scriptDirectory = document.currentScript.src;
			}
			// When MODULARIZE, this JS may be executed later, after document.currentScript
			// is gone, so we saved it, and we use it here instead of any other info.
			if (_scriptName) {
				scriptDirectory = _scriptName;
			}
			// blob urls look like blob:http://site.com/etc/etc and we cannot infer anything from them.
			// otherwise, slice off the final part of the url to find the script directory.
			// if scriptDirectory does not contain a slash, lastIndexOf will return -1,
			// and scriptDirectory will correctly be replaced with an empty string.
			// If scriptDirectory contains a query (starting with ?) or a fragment (starting with #),
			// they are removed because they could contain a slash.
			if (scriptDirectory.startsWith("blob:")) {
				scriptDirectory = "";
			} else {
				scriptDirectory = scriptDirectory.substr(
					0,
					scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1,
				);
			}

			if (
				!(typeof window == "object" || typeof WorkerGlobalScope != "undefined")
			)
				throw new Error(
					"not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)",
				);

			{
				// include: web_or_worker_shell_read.js
				readAsync = async (url) => {
					assert(!isFileURI(url), "readAsync does not work with file:// URLs");
					var response = await fetch(url, { credentials: "same-origin" });
					if (response.ok) {
						return response.arrayBuffer();
					}
					throw new Error(response.status + " : " + response.url);
				};
				// end include: web_or_worker_shell_read.js
			}
		} else {
			throw new Error("environment detection error");
		}

		var out = Module["print"] || console.log.bind(console);
		var err = Module["printErr"] || console.error.bind(console);

		// Merge back in the overrides
		Object.assign(Module, moduleOverrides);
		// Free the object hierarchy contained in the overrides, this lets the GC
		// reclaim data used.
		moduleOverrides = null;
		checkIncomingModuleAPI();

		// Emit code to handle expected values on the Module object. This applies Module.x
		// to the proper local x. This has two benefits: first, we only emit it if it is
		// expected to arrive, and second, by using a local everywhere else that can be
		// minified.

		if (Module["arguments"]) arguments_ = Module["arguments"];
		legacyModuleProp("arguments", "arguments_");

		if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
		legacyModuleProp("thisProgram", "thisProgram");

		// perform assertions in shell.js after we set up out() and err(), as otherwise if an assertion fails it cannot print the message
		// Assertions on removed incoming Module JS APIs.
		assert(
			typeof Module["memoryInitializerPrefixURL"] == "undefined",
			"Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead",
		);
		assert(
			typeof Module["pthreadMainPrefixURL"] == "undefined",
			"Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead",
		);
		assert(
			typeof Module["cdInitializerPrefixURL"] == "undefined",
			"Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead",
		);
		assert(
			typeof Module["filePackagePrefixURL"] == "undefined",
			"Module.filePackagePrefixURL option was removed, use Module.locateFile instead",
		);
		assert(
			typeof Module["read"] == "undefined",
			"Module.read option was removed",
		);
		assert(
			typeof Module["readAsync"] == "undefined",
			"Module.readAsync option was removed (modify readAsync in JS)",
		);
		assert(
			typeof Module["readBinary"] == "undefined",
			"Module.readBinary option was removed (modify readBinary in JS)",
		);
		assert(
			typeof Module["setWindowTitle"] == "undefined",
			"Module.setWindowTitle option was removed (modify emscripten_set_window_title in JS)",
		);
		assert(
			typeof Module["TOTAL_MEMORY"] == "undefined",
			"Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY",
		);
		legacyModuleProp("asm", "wasmExports");
		legacyModuleProp("readAsync", "readAsync");
		legacyModuleProp("readBinary", "readBinary");
		legacyModuleProp("setWindowTitle", "setWindowTitle");
		var IDBFS = "IDBFS is no longer included by default; build with -lidbfs.js";
		var PROXYFS =
			"PROXYFS is no longer included by default; build with -lproxyfs.js";
		var WORKERFS =
			"WORKERFS is no longer included by default; build with -lworkerfs.js";
		var FETCHFS =
			"FETCHFS is no longer included by default; build with -lfetchfs.js";
		var ICASEFS =
			"ICASEFS is no longer included by default; build with -licasefs.js";
		var JSFILEFS =
			"JSFILEFS is no longer included by default; build with -ljsfilefs.js";
		var OPFS = "OPFS is no longer included by default; build with -lopfs.js";

		var NODEFS =
			"NODEFS is no longer included by default; build with -lnodefs.js";

		assert(
			!ENVIRONMENT_IS_WORKER,
			"worker environment detected but not enabled at build time.  Add `worker` to `-sENVIRONMENT` to enable.",
		);

		assert(
			!ENVIRONMENT_IS_NODE,
			"node environment detected but not enabled at build time.  Add `node` to `-sENVIRONMENT` to enable.",
		);

		assert(
			!ENVIRONMENT_IS_SHELL,
			"shell environment detected but not enabled at build time.  Add `shell` to `-sENVIRONMENT` to enable.",
		);

		// end include: shell.js

		// include: preamble.js
		// === Preamble library stuff ===

		// Documentation for the public APIs defined in this file must be updated in:
		//    site/source/docs/api_reference/preamble.js.rst
		// A prebuilt local version of the documentation is available at:
		//    site/build/text/docs/api_reference/preamble.js.txt
		// You can also build docs locally as HTML or other formats in site/
		// An online HTML version (which may be of a different version of Emscripten)
		//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

		var wasmBinary = Module["wasmBinary"];
		legacyModuleProp("wasmBinary", "wasmBinary");

		if (typeof WebAssembly != "object") {
			err("no native wasm support detected");
		}

		// Wasm globals

		var wasmMemory;

		//========================================
		// Runtime essentials
		//========================================

		// whether we are quitting the application. no code should run after this.
		// set in exit() and abort()
		var ABORT = false;

		// set by exit() and abort().  Passed to 'onExit' handler.
		// NOTE: This is also used as the process return code code in shell environments
		// but only when noExitRuntime is false.
		var EXITSTATUS;

		// In STRICT mode, we only define assert() when ASSERTIONS is set.  i.e. we
		// don't define it at all in release modes.  This matches the behaviour of
		// MINIMAL_RUNTIME.
		// TODO(sbc): Make this the default even without STRICT enabled.
		/** @type {function(*, string=)} */
		function assert(condition, text) {
			if (!condition) {
				abort("Assertion failed" + (text ? ": " + text : ""));
			}
		}

		// We used to include malloc/free by default in the past. Show a helpful error in
		// builds with assertions.
		function _free() {
			// Show a helpful error since we used to include free by default in the past.
			abort(
				"free() called but not included in the build - add `_free` to EXPORTED_FUNCTIONS",
			);
		}

		// Memory management

		var HEAP,
			/** @type {!Int8Array} */
			HEAP8,
			/** @type {!Uint8Array} */
			HEAPU8,
			/** @type {!Int16Array} */
			HEAP16,
			/** @type {!Uint16Array} */
			HEAPU16,
			/** @type {!Int32Array} */
			HEAP32,
			/** @type {!Uint32Array} */
			HEAPU32,
			/** @type {!Float32Array} */
			HEAPF32,
			/** @type {!Float64Array} */
			HEAPF64;

		// include: runtime_shared.js
		function updateMemoryViews() {
			var b = wasmMemory.buffer;
			Module["HEAP8"] = HEAP8 = new Int8Array(b);
			Module["HEAP16"] = HEAP16 = new Int16Array(b);
			Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
			Module["HEAPU16"] = HEAPU16 = new Uint16Array(b);
			Module["HEAP32"] = HEAP32 = new Int32Array(b);
			Module["HEAPU32"] = HEAPU32 = new Uint32Array(b);
			Module["HEAPF32"] = HEAPF32 = new Float32Array(b);
			Module["HEAPF64"] = HEAPF64 = new Float64Array(b);
		}

		// end include: runtime_shared.js
		assert(
			!Module["STACK_SIZE"],
			"STACK_SIZE can no longer be set at runtime.  Use -sSTACK_SIZE at link time",
		);

		assert(
			typeof Int32Array != "undefined" &&
				typeof Float64Array !== "undefined" &&
				Int32Array.prototype.subarray != undefined &&
				Int32Array.prototype.set != undefined,
			"JS engine does not provide full typed array support",
		);

		// If memory is defined in wasm, the user can't provide it, or set INITIAL_MEMORY
		assert(
			!Module["wasmMemory"],
			"Use of `wasmMemory` detected.  Use -sIMPORTED_MEMORY to define wasmMemory externally",
		);
		assert(
			!Module["INITIAL_MEMORY"],
			"Detected runtime INITIAL_MEMORY setting.  Use -sIMPORTED_MEMORY to define wasmMemory dynamically",
		);

		// include: runtime_stack_check.js
		// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
		function writeStackCookie() {
			var max = _emscripten_stack_get_end();
			assert((max & 3) == 0);
			// If the stack ends at address zero we write our cookies 4 bytes into the
			// stack.  This prevents interference with SAFE_HEAP and ASAN which also
			// monitor writes to address zero.
			if (max == 0) {
				max += 4;
			}
			// The stack grow downwards towards _emscripten_stack_get_end.
			// We write cookies to the final two words in the stack and detect if they are
			// ever overwritten.
			HEAPU32[max >> 2] = 0x02135467;
			HEAPU32[(max + 4) >> 2] = 0x89bacdfe;
			// Also test the global address 0 for integrity.
			HEAPU32[0 >> 2] = 1668509029;
		}

		function checkStackCookie() {
			if (ABORT) return;
			var max = _emscripten_stack_get_end();
			// See writeStackCookie().
			if (max == 0) {
				max += 4;
			}
			var cookie1 = HEAPU32[max >> 2];
			var cookie2 = HEAPU32[(max + 4) >> 2];
			if (cookie1 != 0x02135467 || cookie2 != 0x89bacdfe) {
				abort(
					`Stack overflow! Stack cookie has been overwritten at ${ptrToString(max)}, expected hex dwords 0x89BACDFE and 0x2135467, but received ${ptrToString(cookie2)} ${ptrToString(cookie1)}`,
				);
			}
			// Also test the global address 0 for integrity.
			if (HEAPU32[0 >> 2] != 0x63736d65 /* 'emsc' */) {
				abort(
					"Runtime error: The application has corrupted its heap memory area (address zero)!",
				);
			}
		}
		// end include: runtime_stack_check.js
		var __ATPRERUN__ = []; // functions called before the runtime is initialized
		var __ATINIT__ = []; // functions called during startup
		var __ATEXIT__ = []; // functions called during shutdown
		var __ATPOSTRUN__ = []; // functions called after the main() is called

		var runtimeInitialized = false;

		function preRun() {
			if (Module["preRun"]) {
				if (typeof Module["preRun"] == "function")
					Module["preRun"] = [Module["preRun"]];
				while (Module["preRun"].length) {
					addOnPreRun(Module["preRun"].shift());
				}
			}
			callRuntimeCallbacks(__ATPRERUN__);
		}

		function initRuntime() {
			assert(!runtimeInitialized);
			runtimeInitialized = true;

			checkStackCookie();

			if (!Module["noFSInit"] && !FS.initialized) FS.init();
			FS.ignorePermissions = false;

			TTY.init();
			SOCKFS.root = FS.mount(SOCKFS, {}, null);
			PIPEFS.root = FS.mount(PIPEFS, {}, null);
			callRuntimeCallbacks(__ATINIT__);
		}

		function postRun() {
			checkStackCookie();

			if (Module["postRun"]) {
				if (typeof Module["postRun"] == "function")
					Module["postRun"] = [Module["postRun"]];
				while (Module["postRun"].length) {
					addOnPostRun(Module["postRun"].shift());
				}
			}

			callRuntimeCallbacks(__ATPOSTRUN__);
		}

		function addOnPreRun(cb) {
			__ATPRERUN__.unshift(cb);
		}

		function addOnInit(cb) {
			__ATINIT__.unshift(cb);
		}

		function addOnExit(cb) {}

		function addOnPostRun(cb) {
			__ATPOSTRUN__.unshift(cb);
		}

		// include: runtime_math.js
		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul

		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/fround

		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32

		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/trunc

		assert(
			Math.imul,
			"This browser does not support Math.imul(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill",
		);
		assert(
			Math.fround,
			"This browser does not support Math.fround(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill",
		);
		assert(
			Math.clz32,
			"This browser does not support Math.clz32(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill",
		);
		assert(
			Math.trunc,
			"This browser does not support Math.trunc(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill",
		);
		// end include: runtime_math.js
		// A counter of dependencies for calling run(). If we need to
		// do asynchronous work before running, increment this and
		// decrement it. Incrementing must happen in a place like
		// Module.preRun (used by emcc to add file preloading).
		// Note that you can add dependencies in preRun, even though
		// it happens right before run - run will be postponed until
		// the dependencies are met.
		var runDependencies = 0;
		var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
		var runDependencyTracking = {};
		var runDependencyWatcher = null;

		function getUniqueRunDependency(id) {
			var orig = id;
			while (1) {
				if (!runDependencyTracking[id]) return id;
				id = orig + Math.random();
			}
		}

		function addRunDependency(id) {
			runDependencies++;

			Module["monitorRunDependencies"]?.(runDependencies);

			if (id) {
				assert(!runDependencyTracking[id]);
				runDependencyTracking[id] = 1;
				if (
					runDependencyWatcher === null &&
					typeof setInterval != "undefined"
				) {
					// Check for missing dependencies every few seconds
					runDependencyWatcher = setInterval(() => {
						if (ABORT) {
							clearInterval(runDependencyWatcher);
							runDependencyWatcher = null;
							return;
						}
						var shown = false;
						for (var dep in runDependencyTracking) {
							if (!shown) {
								shown = true;
								err("still waiting on run dependencies:");
							}
							err(`dependency: ${dep}`);
						}
						if (shown) {
							err("(end of list)");
						}
					}, 10000);
				}
			} else {
				err("warning: run dependency added without ID");
			}
		}

		function removeRunDependency(id) {
			runDependencies--;

			Module["monitorRunDependencies"]?.(runDependencies);

			if (id) {
				assert(runDependencyTracking[id]);
				delete runDependencyTracking[id];
			} else {
				err("warning: run dependency removed without ID");
			}
			if (runDependencies == 0) {
				if (runDependencyWatcher !== null) {
					clearInterval(runDependencyWatcher);
					runDependencyWatcher = null;
				}
				if (dependenciesFulfilled) {
					var callback = dependenciesFulfilled;
					dependenciesFulfilled = null;
					callback(); // can add another dependenciesFulfilled
				}
			}
		}

		/** @param {string|number=} what */
		function abort(what) {
			Module["onAbort"]?.(what);

			what = "Aborted(" + what + ")";
			// TODO(sbc): Should we remove printing and leave it up to whoever
			// catches the exception?
			err(what);

			ABORT = true;

			// Use a wasm runtime error, because a JS error might be seen as a foreign
			// exception, which means we'd run destructors on it. We need the error to
			// simply make the program stop.
			// FIXME This approach does not work in Wasm EH because it currently does not assume
			// all RuntimeErrors are from traps; it decides whether a RuntimeError is from
			// a trap or not based on a hidden field within the object. So at the moment
			// we don't have a way of throwing a wasm trap from JS. TODO Make a JS API that
			// allows this in the wasm spec.

			// Suppress closure compiler warning here. Closure compiler's builtin extern
			// definition for WebAssembly.RuntimeError claims it takes no arguments even
			// though it can.
			// TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure gets fixed.
			/** @suppress {checkTypes} */
			var e = new WebAssembly.RuntimeError(what);

			readyPromiseReject(e);
			// Throw the error whether or not MODULARIZE is set because abort is used
			// in code paths apart from instantiation where an exception is expected
			// to be thrown when abort is called.
			throw e;
		}

		// include: memoryprofiler.js
		// end include: memoryprofiler.js
		// include: URIUtils.js
		// Prefix of data URIs emitted by SINGLE_FILE and related options.
		var dataURIPrefix = "data:application/octet-stream;base64,";

		/**
		 * Indicates whether filename is a base64 data URI.
		 * @noinline
		 */
		var isDataURI = (filename) => filename.startsWith(dataURIPrefix);

		/**
		 * Indicates whether filename is delivered via file protocol (as opposed to http/https)
		 * @noinline
		 */
		var isFileURI = (filename) => filename.startsWith("file://");
		// end include: URIUtils.js
		function createExportWrapper(name, nargs) {
			return (...args) => {
				assert(
					runtimeInitialized,
					`native function \`${name}\` called before runtime initialization`,
				);
				var f = wasmExports[name];
				assert(f, `exported native function \`${name}\` not found`);
				// Only assert for too many arguments. Too few can be valid since the missing arguments will be zero filled.
				assert(
					args.length <= nargs,
					`native function \`${name}\` called with ${args.length} args but expects ${nargs}`,
				);
				return f(...args);
			};
		}

		// include: runtime_exceptions.js
		// end include: runtime_exceptions.js
		function findWasmBinary() {
			if (Module["locateFile"]) {
				var f = "php-wasm.wasm";
				if (!isDataURI(f)) {
					return locateFile(f);
				}
				return f;
			}
			// Use bundler-friendly `new URL(..., import.meta.url)` pattern; works in browsers too.
			return new URL("php-wasm.wasm", import.meta.url).href;
		}

		var wasmBinaryFile;

		function getBinarySync(file) {
			if (file == wasmBinaryFile && wasmBinary) {
				return new Uint8Array(wasmBinary);
			}
			if (readBinary) {
				return readBinary(file);
			}
			throw "both async and sync fetching of the wasm failed";
		}

		async function getWasmBinary(binaryFile) {
			// If we don't have the binary yet, load it asynchronously using readAsync.
			if (!wasmBinary) {
				// Fetch the binary using readAsync
				try {
					var response = await readAsync(binaryFile);
					return new Uint8Array(response);
				} catch {
					// Fall back to getBinarySync below;
				}
			}

			// Otherwise, getBinarySync should be able to get it synchronously
			return getBinarySync(binaryFile);
		}

		async function instantiateArrayBuffer(binaryFile, imports) {
			try {
				var binary = await getWasmBinary(binaryFile);
				var instance = await WebAssembly.instantiate(binary, imports);
				return instance;
			} catch (reason) {
				err(`failed to asynchronously prepare wasm: ${reason}`);

				// Warn on some common problems.
				if (isFileURI(wasmBinaryFile)) {
					err(
						`warning: Loading from a file URI (${wasmBinaryFile}) is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing`,
					);
				}
				abort(reason);
			}
		}

		async function instantiateAsync(binary, binaryFile, imports) {
			if (
				!binary &&
				typeof WebAssembly.instantiateStreaming == "function" &&
				!isDataURI(binaryFile) &&
				typeof fetch == "function"
			) {
				try {
					var response = fetch(binaryFile, { credentials: "same-origin" });
					var instantiationResult = await WebAssembly.instantiateStreaming(
						response,
						imports,
					);
					return instantiationResult;
				} catch (reason) {
					// We expect the most common failure cause to be a bad MIME type for the binary,
					// in which case falling back to ArrayBuffer instantiation should work.
					err(`wasm streaming compile failed: ${reason}`);
					err("falling back to ArrayBuffer instantiation");
					// fall back of instantiateArrayBuffer below
				}
			}
			return instantiateArrayBuffer(binaryFile, imports);
		}

		function getWasmImports() {
			// prepare imports
			return {
				env: wasmImports,
				wasi_snapshot_preview1: wasmImports,
			};
		}

		// Create the wasm instance.
		// Receives the wasm imports, returns the exports.
		async function createWasm() {
			// Load the wasm module and create an instance of using native support in the JS engine.
			// handle a generated wasm instance, receiving its exports and
			// performing other necessary setup
			/** @param {WebAssembly.Module=} module*/
			function receiveInstance(instance, module) {
				wasmExports = instance.exports;

				wasmMemory = wasmExports["memory"];

				assert(wasmMemory, "memory not found in wasm exports");
				updateMemoryViews();

				wasmTable = wasmExports["__indirect_function_table"];

				assert(wasmTable, "table not found in wasm exports");

				addOnInit(wasmExports["__wasm_call_ctors"]);

				removeRunDependency("wasm-instantiate");
				return wasmExports;
			}
			// wait for the pthread pool (if any)
			addRunDependency("wasm-instantiate");

			// Prefer streaming instantiation if available.
			// Async compilation can be confusing when an error on the page overwrites Module
			// (for example, if the order of elements is wrong, and the one defining Module is
			// later), so we save Module and check it later.
			var trueModule = Module;
			function receiveInstantiationResult(result) {
				// 'result' is a ResultObject object which has both the module and instance.
				// receiveInstance() will swap in the exports (to Module.asm) so they can be called
				assert(
					Module === trueModule,
					"the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?",
				);
				trueModule = null;
				// TODO: Due to Closure regression https://github.com/google/closure-compiler/issues/3193, the above line no longer optimizes out down to the following line.
				// When the regression is fixed, can restore the above PTHREADS-enabled path.
				receiveInstance(result["instance"]);
			}

			var info = getWasmImports();

			// User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
			// to manually instantiate the Wasm module themselves. This allows pages to
			// run the instantiation parallel to any other async startup actions they are
			// performing.
			// Also pthreads and wasm workers initialize the wasm instance through this
			// path.
			if (Module["instantiateWasm"]) {
				try {
					return Module["instantiateWasm"](info, receiveInstance);
				} catch (e) {
					err(`Module.instantiateWasm callback failed with error: ${e}`);
					// If instantiation fails, reject the module ready promise.
					readyPromiseReject(e);
				}
			}

			wasmBinaryFile ??= findWasmBinary();

			try {
				var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
				receiveInstantiationResult(result);
				return result;
			} catch (e) {
				// If instantiation fails, reject the module ready promise.
				readyPromiseReject(e);
				return;
			}
		}

		// Globals used by JS i64 conversions (see makeSetValue)
		var tempDouble;
		var tempI64;

		// include: runtime_debug.js
		// Endianness check
		(() => {
			var h16 = new Int16Array(1);
			var h8 = new Int8Array(h16.buffer);
			h16[0] = 0x6373;
			if (h8[0] !== 0x73 || h8[1] !== 0x63)
				throw "Runtime error: expected the system to be little-endian! (Run with -sSUPPORT_BIG_ENDIAN to bypass)";
		})();

		if (Module["ENVIRONMENT"]) {
			throw new Error(
				"Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -sENVIRONMENT=web or -sENVIRONMENT=node)",
			);
		}

		function legacyModuleProp(prop, newName, incoming = true) {
			if (!Object.getOwnPropertyDescriptor(Module, prop)) {
				Object.defineProperty(Module, prop, {
					configurable: true,
					get() {
						let extra = incoming
							? " (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)"
							: "";
						abort(
							`\`Module.${prop}\` has been replaced by \`${newName}\`` + extra,
						);
					},
				});
			}
		}

		function ignoredModuleProp(prop) {
			if (Object.getOwnPropertyDescriptor(Module, prop)) {
				abort(
					`\`Module.${prop}\` was supplied but \`${prop}\` not included in INCOMING_MODULE_JS_API`,
				);
			}
		}

		// forcing the filesystem exports a few things by default
		function isExportedByForceFilesystem(name) {
			return (
				name === "FS_createPath" ||
				name === "FS_createDataFile" ||
				name === "FS_createPreloadedFile" ||
				name === "FS_unlink" ||
				name === "addRunDependency" ||
				// The old FS has some functionality that WasmFS lacks.
				name === "FS_createLazyFile" ||
				name === "FS_createDevice" ||
				name === "removeRunDependency"
			);
		}

		/**
		 * Intercept access to a global symbol.  This enables us to give informative
		 * warnings/errors when folks attempt to use symbols they did not include in
		 * their build, or no symbols that no longer exist.
		 */
		function hookGlobalSymbolAccess(sym, func) {
			if (
				typeof globalThis != "undefined" &&
				!Object.getOwnPropertyDescriptor(globalThis, sym)
			) {
				Object.defineProperty(globalThis, sym, {
					configurable: true,
					get() {
						func();
						return undefined;
					},
				});
			}
		}

		function missingGlobal(sym, msg) {
			hookGlobalSymbolAccess(sym, () => {
				warnOnce(`\`${sym}\` is not longer defined by emscripten. ${msg}`);
			});
		}

		missingGlobal("buffer", "Please use HEAP8.buffer or wasmMemory.buffer");
		missingGlobal("asm", "Please use wasmExports instead");

		function missingLibrarySymbol(sym) {
			hookGlobalSymbolAccess(sym, () => {
				// Can't `abort()` here because it would break code that does runtime
				// checks.  e.g. `if (typeof SDL === 'undefined')`.
				var msg = `\`${sym}\` is a library symbol and not included by default; add it to your library.js __deps or to DEFAULT_LIBRARY_FUNCS_TO_INCLUDE on the command line`;
				// DEFAULT_LIBRARY_FUNCS_TO_INCLUDE requires the name as it appears in
				// library.js, which means $name for a JS name with no prefix, or name
				// for a JS name like _name.
				var librarySymbol = sym;
				if (!librarySymbol.startsWith("_")) {
					librarySymbol = "$" + sym;
				}
				msg += ` (e.g. -sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE='${librarySymbol}')`;
				if (isExportedByForceFilesystem(sym)) {
					msg +=
						". Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you";
				}
				warnOnce(msg);
			});

			// Any symbol that is not included from the JS library is also (by definition)
			// not exported on the Module object.
			unexportedRuntimeSymbol(sym);
		}

		function unexportedRuntimeSymbol(sym) {
			if (!Object.getOwnPropertyDescriptor(Module, sym)) {
				Object.defineProperty(Module, sym, {
					configurable: true,
					get() {
						var msg = `'${sym}' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the Emscripten FAQ)`;
						if (isExportedByForceFilesystem(sym)) {
							msg +=
								". Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you";
						}
						abort(msg);
					},
				});
			}
		}

		// Used by XXXXX_DEBUG settings to output debug messages.
		function dbg(...args) {
			// TODO(sbc): Make this configurable somehow.  Its not always convenient for
			// logging to show up as warnings.
			console.warn(...args);
		}
		// end include: runtime_debug.js
		// === Body ===
		// end include: preamble.js

		class ExitStatus {
			name = "ExitStatus";
			constructor(status) {
				this.message = `Program terminated with exit(${status})`;
				this.status = status;
			}
		}

		var callRuntimeCallbacks = (callbacks) => {
			while (callbacks.length > 0) {
				// Pass the module as the first argument.
				callbacks.shift()(Module);
			}
		};

		/**
		 * @param {number} ptr
		 * @param {string} type
		 */
		function getValue(ptr, type = "i8") {
			if (type.endsWith("*")) type = "*";
			switch (type) {
				case "i1":
					return HEAP8[ptr];
				case "i8":
					return HEAP8[ptr];
				case "i16":
					return HEAP16[ptr >> 1];
				case "i32":
					return HEAP32[ptr >> 2];
				case "i64":
					abort("to do getValue(i64) use WASM_BIGINT");
				case "float":
					return HEAPF32[ptr >> 2];
				case "double":
					return HEAPF64[ptr >> 3];
				case "*":
					return HEAPU32[ptr >> 2];
				default:
					abort(`invalid type for getValue: ${type}`);
			}
		}

		var noExitRuntime = Module["noExitRuntime"] || true;

		var ptrToString = (ptr) => {
			assert(typeof ptr === "number");
			// With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
			ptr >>>= 0;
			return "0x" + ptr.toString(16).padStart(8, "0");
		};

		/**
		 * @param {number} ptr
		 * @param {number} value
		 * @param {string} type
		 */
		function setValue(ptr, value, type = "i8") {
			if (type.endsWith("*")) type = "*";
			switch (type) {
				case "i1":
					HEAP8[ptr] = value;
					break;
				case "i8":
					HEAP8[ptr] = value;
					break;
				case "i16":
					HEAP16[ptr >> 1] = value;
					break;
				case "i32":
					HEAP32[ptr >> 2] = value;
					break;
				case "i64":
					abort("to do setValue(i64) use WASM_BIGINT");
				case "float":
					HEAPF32[ptr >> 2] = value;
					break;
				case "double":
					HEAPF64[ptr >> 3] = value;
					break;
				case "*":
					HEAPU32[ptr >> 2] = value;
					break;
				default:
					abort(`invalid type for setValue: ${type}`);
			}
		}

		var stackRestore = (val) => __emscripten_stack_restore(val);

		var stackSave = () => _emscripten_stack_get_current();

		var warnOnce = (text) => {
			warnOnce.shown ||= {};
			if (!warnOnce.shown[text]) {
				warnOnce.shown[text] = 1;
				err(text);
			}
		};

		var UTF8Decoder =
			typeof TextDecoder != "undefined" ? new TextDecoder() : undefined;

		/**
		 * Given a pointer 'idx' to a null-terminated UTF8-encoded string in the given
		 * array that contains uint8 values, returns a copy of that string as a
		 * Javascript String object.
		 * heapOrArray is either a regular array, or a JavaScript typed array view.
		 * @param {number=} idx
		 * @param {number=} maxBytesToRead
		 * @return {string}
		 */
		var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead = NaN) => {
			var endIdx = idx + maxBytesToRead;
			var endPtr = idx;
			// TextDecoder needs to know the byte length in advance, it doesn't stop on
			// null terminator by itself.  Also, use the length info to avoid running tiny
			// strings through TextDecoder, since .subarray() allocates garbage.
			// (As a tiny code save trick, compare endPtr against endIdx using a negation,
			// so that undefined/NaN means Infinity)
			while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;

			if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
				return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
			}
			var str = "";
			// If building with TextDecoder, we have already computed the string length
			// above, so test loop end condition against that
			while (idx < endPtr) {
				// For UTF8 byte structure, see:
				// http://en.wikipedia.org/wiki/UTF-8#Description
				// https://www.ietf.org/rfc/rfc2279.txt
				// https://tools.ietf.org/html/rfc3629
				var u0 = heapOrArray[idx++];
				if (!(u0 & 0x80)) {
					str += String.fromCharCode(u0);
					continue;
				}
				var u1 = heapOrArray[idx++] & 63;
				if ((u0 & 0xe0) == 0xc0) {
					str += String.fromCharCode(((u0 & 31) << 6) | u1);
					continue;
				}
				var u2 = heapOrArray[idx++] & 63;
				if ((u0 & 0xf0) == 0xe0) {
					u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
				} else {
					if ((u0 & 0xf8) != 0xf0)
						warnOnce(
							"Invalid UTF-8 leading byte " +
								ptrToString(u0) +
								" encountered when deserializing a UTF-8 string in wasm memory to a JS string!",
						);
					u0 =
						((u0 & 7) << 18) |
						(u1 << 12) |
						(u2 << 6) |
						(heapOrArray[idx++] & 63);
				}

				if (u0 < 0x10000) {
					str += String.fromCharCode(u0);
				} else {
					var ch = u0 - 0x10000;
					str += String.fromCharCode(
						0xd800 | (ch >> 10),
						0xdc00 | (ch & 0x3ff),
					);
				}
			}
			return str;
		};

		/**
		 * Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the
		 * emscripten HEAP, returns a copy of that string as a Javascript String object.
		 *
		 * @param {number} ptr
		 * @param {number=} maxBytesToRead - An optional length that specifies the
		 *   maximum number of bytes to read. You can omit this parameter to scan the
		 *   string until the first 0 byte. If maxBytesToRead is passed, and the string
		 *   at [ptr, ptr+maxBytesToReadr[ contains a null byte in the middle, then the
		 *   string will cut short at that byte index (i.e. maxBytesToRead will not
		 *   produce a string of exact length [ptr, ptr+maxBytesToRead[) N.B. mixing
		 *   frequent uses of UTF8ToString() with and without maxBytesToRead may throw
		 *   JS JIT optimizations off, so it is worth to consider consistently using one
		 * @return {string}
		 */
		var UTF8ToString = (ptr, maxBytesToRead) => {
			assert(
				typeof ptr == "number",
				`UTF8ToString expects a number (got ${typeof ptr})`,
			);
			return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "";
		};
		var ___assert_fail = (condition, filename, line, func) =>
			abort(
				`Assertion failed: ${UTF8ToString(condition)}, at: ` +
					[
						filename ? UTF8ToString(filename) : "unknown filename",
						line,
						func ? UTF8ToString(func) : "unknown function",
					],
			);

		var wasmTableMirror = [];

		/** @type {WebAssembly.Table} */
		var wasmTable;
		var getWasmTableEntry = (funcPtr) => {
			var func = wasmTableMirror[funcPtr];
			if (!func) {
				if (funcPtr >= wasmTableMirror.length)
					wasmTableMirror.length = funcPtr + 1;
				/** @suppress {checkTypes} */
				wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
			}
			/** @suppress {checkTypes} */
			assert(
				wasmTable.get(funcPtr) == func,
				"JavaScript-side Wasm function table mirror is out of date!",
			);
			return func;
		};
		var ___call_sighandler = (fp, sig) => getWasmTableEntry(fp)(sig);

		var PATH = {
			isAbs: (path) => path.charAt(0) === "/",
			splitPath: (filename) => {
				var splitPathRe =
					/^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
				return splitPathRe.exec(filename).slice(1);
			},
			normalizeArray: (parts, allowAboveRoot) => {
				// if the path tries to go above the root, `up` ends up > 0
				var up = 0;
				for (var i = parts.length - 1; i >= 0; i--) {
					var last = parts[i];
					if (last === ".") {
						parts.splice(i, 1);
					} else if (last === "..") {
						parts.splice(i, 1);
						up++;
					} else if (up) {
						parts.splice(i, 1);
						up--;
					}
				}
				// if the path is allowed to go above the root, restore leading ..s
				if (allowAboveRoot) {
					for (; up; up--) {
						parts.unshift("..");
					}
				}
				return parts;
			},
			normalize: (path) => {
				var isAbsolute = PATH.isAbs(path),
					trailingSlash = path.substr(-1) === "/";
				// Normalize the path
				path = PATH.normalizeArray(
					path.split("/").filter((p) => !!p),
					!isAbsolute,
				).join("/");
				if (!path && !isAbsolute) {
					path = ".";
				}
				if (path && trailingSlash) {
					path += "/";
				}
				return (isAbsolute ? "/" : "") + path;
			},
			dirname: (path) => {
				var result = PATH.splitPath(path),
					root = result[0],
					dir = result[1];
				if (!root && !dir) {
					// No dirname whatsoever
					return ".";
				}
				if (dir) {
					// It has a dirname, strip trailing slash
					dir = dir.substr(0, dir.length - 1);
				}
				return root + dir;
			},
			basename: (path) => {
				// EMSCRIPTEN return '/'' for '/', not an empty string
				if (path === "/") return "/";
				path = PATH.normalize(path);
				path = path.replace(/\/$/, "");
				var lastSlash = path.lastIndexOf("/");
				if (lastSlash === -1) return path;
				return path.substr(lastSlash + 1);
			},
			join: (...paths) => PATH.normalize(paths.join("/")),
			join2: (l, r) => PATH.normalize(l + "/" + r),
		};

		var initRandomFill = () => {
			if (
				typeof crypto == "object" &&
				typeof crypto["getRandomValues"] == "function"
			) {
				// for modern web browsers
				return (view) => crypto.getRandomValues(view);
			}
			// we couldn't find a proper implementation, as Math.random() is not suitable for /dev/random, see emscripten-core/emscripten/pull/7096
			else
				abort(
					"no cryptographic support found for randomDevice. consider polyfilling it if you want to use something insecure like Math.random(), e.g. put this in a --pre-js: var crypto = { getRandomValues: (array) => { for (var i = 0; i < array.length; i++) array[i] = (Math.random()*256)|0 } };",
				);
		};
		var randomFill = (view) => {
			// Lazily init on the first invocation.
			return (randomFill = initRandomFill())(view);
		};

		var PATH_FS = {
			resolve: (...args) => {
				var resolvedPath = "",
					resolvedAbsolute = false;
				for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
					var path = i >= 0 ? args[i] : FS.cwd();
					// Skip empty and invalid entries
					if (typeof path != "string") {
						throw new TypeError("Arguments to path.resolve must be strings");
					} else if (!path) {
						return ""; // an invalid portion invalidates the whole thing
					}
					resolvedPath = path + "/" + resolvedPath;
					resolvedAbsolute = PATH.isAbs(path);
				}
				// At this point the path should be resolved to a full absolute path, but
				// handle relative paths to be safe (might happen when process.cwd() fails)
				resolvedPath = PATH.normalizeArray(
					resolvedPath.split("/").filter((p) => !!p),
					!resolvedAbsolute,
				).join("/");
				return (resolvedAbsolute ? "/" : "") + resolvedPath || ".";
			},
			relative: (from, to) => {
				from = PATH_FS.resolve(from).substr(1);
				to = PATH_FS.resolve(to).substr(1);
				function trim(arr) {
					var start = 0;
					for (; start < arr.length; start++) {
						if (arr[start] !== "") break;
					}
					var end = arr.length - 1;
					for (; end >= 0; end--) {
						if (arr[end] !== "") break;
					}
					if (start > end) return [];
					return arr.slice(start, end - start + 1);
				}
				var fromParts = trim(from.split("/"));
				var toParts = trim(to.split("/"));
				var length = Math.min(fromParts.length, toParts.length);
				var samePartsLength = length;
				for (var i = 0; i < length; i++) {
					if (fromParts[i] !== toParts[i]) {
						samePartsLength = i;
						break;
					}
				}
				var outputParts = [];
				for (var i = samePartsLength; i < fromParts.length; i++) {
					outputParts.push("..");
				}
				outputParts = outputParts.concat(toParts.slice(samePartsLength));
				return outputParts.join("/");
			},
		};

		var FS_stdin_getChar_buffer = [];

		var lengthBytesUTF8 = (str) => {
			var len = 0;
			for (var i = 0; i < str.length; ++i) {
				// Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
				// unit, not a Unicode code point of the character! So decode
				// UTF16->UTF32->UTF8.
				// See http://unicode.org/faq/utf_bom.html#utf16-3
				var c = str.charCodeAt(i); // possibly a lead surrogate
				if (c <= 0x7f) {
					len++;
				} else if (c <= 0x7ff) {
					len += 2;
				} else if (c >= 0xd800 && c <= 0xdfff) {
					len += 4;
					++i;
				} else {
					len += 3;
				}
			}
			return len;
		};

		var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
			assert(
				typeof str === "string",
				`stringToUTF8Array expects a string (got ${typeof str})`,
			);
			// Parameter maxBytesToWrite is not optional. Negative values, 0, null,
			// undefined and false each don't write out any bytes.
			if (!(maxBytesToWrite > 0)) return 0;

			var startIdx = outIdx;
			var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
			for (var i = 0; i < str.length; ++i) {
				// Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
				// unit, not a Unicode code point of the character! So decode
				// UTF16->UTF32->UTF8.
				// See http://unicode.org/faq/utf_bom.html#utf16-3
				// For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description
				// and https://www.ietf.org/rfc/rfc2279.txt
				// and https://tools.ietf.org/html/rfc3629
				var u = str.charCodeAt(i); // possibly a lead surrogate
				if (u >= 0xd800 && u <= 0xdfff) {
					var u1 = str.charCodeAt(++i);
					u = (0x10000 + ((u & 0x3ff) << 10)) | (u1 & 0x3ff);
				}
				if (u <= 0x7f) {
					if (outIdx >= endIdx) break;
					heap[outIdx++] = u;
				} else if (u <= 0x7ff) {
					if (outIdx + 1 >= endIdx) break;
					heap[outIdx++] = 0xc0 | (u >> 6);
					heap[outIdx++] = 0x80 | (u & 63);
				} else if (u <= 0xffff) {
					if (outIdx + 2 >= endIdx) break;
					heap[outIdx++] = 0xe0 | (u >> 12);
					heap[outIdx++] = 0x80 | ((u >> 6) & 63);
					heap[outIdx++] = 0x80 | (u & 63);
				} else {
					if (outIdx + 3 >= endIdx) break;
					if (u > 0x10ffff)
						warnOnce(
							"Invalid Unicode code point " +
								ptrToString(u) +
								" encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF).",
						);
					heap[outIdx++] = 0xf0 | (u >> 18);
					heap[outIdx++] = 0x80 | ((u >> 12) & 63);
					heap[outIdx++] = 0x80 | ((u >> 6) & 63);
					heap[outIdx++] = 0x80 | (u & 63);
				}
			}
			// Null-terminate the pointer to the buffer.
			heap[outIdx] = 0;
			return outIdx - startIdx;
		};
		/** @type {function(string, boolean=, number=)} */
		function intArrayFromString(stringy, dontAddNull, length) {
			var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
			var u8array = new Array(len);
			var numBytesWritten = stringToUTF8Array(
				stringy,
				u8array,
				0,
				u8array.length,
			);
			if (dontAddNull) u8array.length = numBytesWritten;
			return u8array;
		}
		var FS_stdin_getChar = () => {
			if (!FS_stdin_getChar_buffer.length) {
				var result = null;
				if (
					typeof window != "undefined" &&
					typeof window.prompt == "function"
				) {
					// Browser.
					result = window.prompt("Input: "); // returns null on cancel
					if (result !== null) {
						result += "\n";
					}
				} else {
				}
				if (!result) {
					return null;
				}
				FS_stdin_getChar_buffer = intArrayFromString(result, true);
			}
			return FS_stdin_getChar_buffer.shift();
		};
		var TTY = {
			ttys: [],
			init() {
				// https://github.com/emscripten-core/emscripten/pull/1555
				// if (ENVIRONMENT_IS_NODE) {
				//   // currently, FS.init does not distinguish if process.stdin is a file or TTY
				//   // device, it always assumes it's a TTY device. because of this, we're forcing
				//   // process.stdin to UTF8 encoding to at least make stdin reading compatible
				//   // with text files until FS.init can be refactored.
				//   process.stdin.setEncoding('utf8');
				// }
			},
			shutdown() {
				// https://github.com/emscripten-core/emscripten/pull/1555
				// if (ENVIRONMENT_IS_NODE) {
				//   // inolen: any idea as to why node -e 'process.stdin.read()' wouldn't exit immediately (with process.stdin being a tty)?
				//   // isaacs: because now it's reading from the stream, you've expressed interest in it, so that read() kicks off a _read() which creates a ReadReq operation
				//   // inolen: I thought read() in that case was a synchronous operation that just grabbed some amount of buffered data if it exists?
				//   // isaacs: it is. but it also triggers a _read() call, which calls readStart() on the handle
				//   // isaacs: do process.stdin.pause() and i'd think it'd probably close the pending call
				//   process.stdin.pause();
				// }
			},
			register(dev, ops) {
				TTY.ttys[dev] = { input: [], output: [], ops: ops };
				FS.registerDevice(dev, TTY.stream_ops);
			},
			stream_ops: {
				open(stream) {
					var tty = TTY.ttys[stream.node.rdev];
					if (!tty) {
						throw new FS.ErrnoError(43);
					}
					stream.tty = tty;
					stream.seekable = false;
				},
				close(stream) {
					// flush any pending line data
					stream.tty.ops.fsync(stream.tty);
				},
				fsync(stream) {
					stream.tty.ops.fsync(stream.tty);
				},
				read(stream, buffer, offset, length, pos /* ignored */) {
					if (!stream.tty || !stream.tty.ops.get_char) {
						throw new FS.ErrnoError(60);
					}
					var bytesRead = 0;
					for (var i = 0; i < length; i++) {
						var result;
						try {
							result = stream.tty.ops.get_char(stream.tty);
						} catch (e) {
							throw new FS.ErrnoError(29);
						}
						if (result === undefined && bytesRead === 0) {
							throw new FS.ErrnoError(6);
						}
						if (result === null || result === undefined) break;
						bytesRead++;
						buffer[offset + i] = result;
					}
					if (bytesRead) {
						stream.node.atime = Date.now();
					}
					return bytesRead;
				},
				write(stream, buffer, offset, length, pos) {
					if (!stream.tty || !stream.tty.ops.put_char) {
						throw new FS.ErrnoError(60);
					}
					try {
						for (var i = 0; i < length; i++) {
							stream.tty.ops.put_char(stream.tty, buffer[offset + i]);
						}
					} catch (e) {
						throw new FS.ErrnoError(29);
					}
					if (length) {
						stream.node.mtime = stream.node.ctime = Date.now();
					}
					return i;
				},
			},
			default_tty_ops: {
				get_char(tty) {
					return FS_stdin_getChar();
				},
				put_char(tty, val) {
					if (val === null || val === 10) {
						out(UTF8ArrayToString(tty.output));
						tty.output = [];
					} else {
						if (val != 0) tty.output.push(val); // val == 0 would cut text output off in the middle.
					}
				},
				fsync(tty) {
					if (tty.output && tty.output.length > 0) {
						out(UTF8ArrayToString(tty.output));
						tty.output = [];
					}
				},
				ioctl_tcgets(tty) {
					// typical setting
					return {
						c_iflag: 25856,
						c_oflag: 5,
						c_cflag: 191,
						c_lflag: 35387,
						c_cc: [
							0x03, 0x1c, 0x7f, 0x15, 0x04, 0x00, 0x01, 0x00, 0x11, 0x13, 0x1a,
							0x00, 0x12, 0x0f, 0x17, 0x16, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
							0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
						],
					};
				},
				ioctl_tcsets(tty, optional_actions, data) {
					// currently just ignore
					return 0;
				},
				ioctl_tiocgwinsz(tty) {
					return [24, 80];
				},
			},
			default_tty1_ops: {
				put_char(tty, val) {
					if (val === null || val === 10) {
						err(UTF8ArrayToString(tty.output));
						tty.output = [];
					} else {
						if (val != 0) tty.output.push(val);
					}
				},
				fsync(tty) {
					if (tty.output && tty.output.length > 0) {
						err(UTF8ArrayToString(tty.output));
						tty.output = [];
					}
				},
			},
		};

		var zeroMemory = (address, size) => {
			HEAPU8.fill(0, address, address + size);
		};

		var alignMemory = (size, alignment) => {
			assert(alignment, "alignment argument is required");
			return Math.ceil(size / alignment) * alignment;
		};
		var mmapAlloc = (size) => {
			size = alignMemory(size, 65536);
			var ptr = _emscripten_builtin_memalign(65536, size);
			if (ptr) zeroMemory(ptr, size);
			return ptr;
		};
		var MEMFS = {
			ops_table: null,
			mount(mount) {
				return MEMFS.createNode(null, "/", 16895, 0);
			},
			createNode(parent, name, mode, dev) {
				if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
					// no supported
					throw new FS.ErrnoError(63);
				}
				MEMFS.ops_table ||= {
					dir: {
						node: {
							getattr: MEMFS.node_ops.getattr,
							setattr: MEMFS.node_ops.setattr,
							lookup: MEMFS.node_ops.lookup,
							mknod: MEMFS.node_ops.mknod,
							rename: MEMFS.node_ops.rename,
							unlink: MEMFS.node_ops.unlink,
							rmdir: MEMFS.node_ops.rmdir,
							readdir: MEMFS.node_ops.readdir,
							symlink: MEMFS.node_ops.symlink,
						},
						stream: {
							llseek: MEMFS.stream_ops.llseek,
						},
					},
					file: {
						node: {
							getattr: MEMFS.node_ops.getattr,
							setattr: MEMFS.node_ops.setattr,
						},
						stream: {
							llseek: MEMFS.stream_ops.llseek,
							read: MEMFS.stream_ops.read,
							write: MEMFS.stream_ops.write,
							allocate: MEMFS.stream_ops.allocate,
							mmap: MEMFS.stream_ops.mmap,
							msync: MEMFS.stream_ops.msync,
						},
					},
					link: {
						node: {
							getattr: MEMFS.node_ops.getattr,
							setattr: MEMFS.node_ops.setattr,
							readlink: MEMFS.node_ops.readlink,
						},
						stream: {},
					},
					chrdev: {
						node: {
							getattr: MEMFS.node_ops.getattr,
							setattr: MEMFS.node_ops.setattr,
						},
						stream: FS.chrdev_stream_ops,
					},
				};
				var node = FS.createNode(parent, name, mode, dev);
				if (FS.isDir(node.mode)) {
					node.node_ops = MEMFS.ops_table.dir.node;
					node.stream_ops = MEMFS.ops_table.dir.stream;
					node.contents = {};
				} else if (FS.isFile(node.mode)) {
					node.node_ops = MEMFS.ops_table.file.node;
					node.stream_ops = MEMFS.ops_table.file.stream;
					node.usedBytes = 0; // The actual number of bytes used in the typed array, as opposed to contents.length which gives the whole capacity.
					// When the byte data of the file is populated, this will point to either a typed array, or a normal JS array. Typed arrays are preferred
					// for performance, and used by default. However, typed arrays are not resizable like normal JS arrays are, so there is a small disk size
					// penalty involved for appending file writes that continuously grow a file similar to std::vector capacity vs used -scheme.
					node.contents = null;
				} else if (FS.isLink(node.mode)) {
					node.node_ops = MEMFS.ops_table.link.node;
					node.stream_ops = MEMFS.ops_table.link.stream;
				} else if (FS.isChrdev(node.mode)) {
					node.node_ops = MEMFS.ops_table.chrdev.node;
					node.stream_ops = MEMFS.ops_table.chrdev.stream;
				}
				node.atime = node.mtime = node.ctime = Date.now();
				// add the new node to the parent
				if (parent) {
					parent.contents[name] = node;
					parent.atime = parent.mtime = parent.ctime = node.atime;
				}
				return node;
			},
			getFileDataAsTypedArray(node) {
				if (!node.contents) return new Uint8Array(0);
				if (node.contents.subarray)
					return node.contents.subarray(0, node.usedBytes); // Make sure to not return excess unused bytes.
				return new Uint8Array(node.contents);
			},
			expandFileStorage(node, newCapacity) {
				var prevCapacity = node.contents ? node.contents.length : 0;
				if (prevCapacity >= newCapacity) return; // No need to expand, the storage was already large enough.
				// Don't expand strictly to the given requested limit if it's only a very small increase, but instead geometrically grow capacity.
				// For small filesizes (<1MB), perform size*2 geometric increase, but for large sizes, do a much more conservative size*1.125 increase to
				// avoid overshooting the allocation cap by a very large margin.
				var CAPACITY_DOUBLING_MAX = 1024 * 1024;
				newCapacity = Math.max(
					newCapacity,
					(prevCapacity *
						(prevCapacity < CAPACITY_DOUBLING_MAX ? 2.0 : 1.125)) >>>
						0,
				);
				if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256); // At minimum allocate 256b for each file when expanding.
				var oldContents = node.contents;
				node.contents = new Uint8Array(newCapacity); // Allocate new storage.
				if (node.usedBytes > 0)
					node.contents.set(oldContents.subarray(0, node.usedBytes), 0); // Copy old data over to the new storage.
			},
			resizeFileStorage(node, newSize) {
				if (node.usedBytes == newSize) return;
				if (newSize == 0) {
					node.contents = null; // Fully decommit when requesting a resize to zero.
					node.usedBytes = 0;
				} else {
					var oldContents = node.contents;
					node.contents = new Uint8Array(newSize); // Allocate new storage.
					if (oldContents) {
						node.contents.set(
							oldContents.subarray(0, Math.min(newSize, node.usedBytes)),
						); // Copy old data over to the new storage.
					}
					node.usedBytes = newSize;
				}
			},
			node_ops: {
				getattr(node) {
					var attr = {};
					// device numbers reuse inode numbers.
					attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
					attr.ino = node.id;
					attr.mode = node.mode;
					attr.nlink = 1;
					attr.uid = 0;
					attr.gid = 0;
					attr.rdev = node.rdev;
					if (FS.isDir(node.mode)) {
						attr.size = 4096;
					} else if (FS.isFile(node.mode)) {
						attr.size = node.usedBytes;
					} else if (FS.isLink(node.mode)) {
						attr.size = node.link.length;
					} else {
						attr.size = 0;
					}
					attr.atime = new Date(node.atime);
					attr.mtime = new Date(node.mtime);
					attr.ctime = new Date(node.ctime);
					// NOTE: In our implementation, st_blocks = Math.ceil(st_size/st_blksize),
					//       but this is not required by the standard.
					attr.blksize = 4096;
					attr.blocks = Math.ceil(attr.size / attr.blksize);
					return attr;
				},
				setattr(node, attr) {
					for (const key of ["mode", "atime", "mtime", "ctime"]) {
						if (attr[key]) {
							node[key] = attr[key];
						}
					}
					if (attr.size !== undefined) {
						MEMFS.resizeFileStorage(node, attr.size);
					}
				},
				lookup(parent, name) {
					throw new FS.ErrnoError(44);
				},
				mknod(parent, name, mode, dev) {
					return MEMFS.createNode(parent, name, mode, dev);
				},
				rename(old_node, new_dir, new_name) {
					var new_node;
					try {
						new_node = FS.lookupNode(new_dir, new_name);
					} catch (e) {}
					if (new_node) {
						if (FS.isDir(old_node.mode)) {
							// if we're overwriting a directory at new_name, make sure it's empty.
							for (var i in new_node.contents) {
								throw new FS.ErrnoError(55);
							}
						}
						FS.hashRemoveNode(new_node);
					}
					// do the internal rewiring
					delete old_node.parent.contents[old_node.name];
					new_dir.contents[new_name] = old_node;
					old_node.name = new_name;
					new_dir.ctime =
						new_dir.mtime =
						old_node.parent.ctime =
						old_node.parent.mtime =
							Date.now();
				},
				unlink(parent, name) {
					delete parent.contents[name];
					parent.ctime = parent.mtime = Date.now();
				},
				rmdir(parent, name) {
					var node = FS.lookupNode(parent, name);
					for (var i in node.contents) {
						throw new FS.ErrnoError(55);
					}
					delete parent.contents[name];
					parent.ctime = parent.mtime = Date.now();
				},
				readdir(node) {
					return [".", "..", ...Object.keys(node.contents)];
				},
				symlink(parent, newname, oldpath) {
					var node = MEMFS.createNode(parent, newname, 0o777 | 40960, 0);
					node.link = oldpath;
					return node;
				},
				readlink(node) {
					if (!FS.isLink(node.mode)) {
						throw new FS.ErrnoError(28);
					}
					return node.link;
				},
			},
			stream_ops: {
				read(stream, buffer, offset, length, position) {
					var contents = stream.node.contents;
					if (position >= stream.node.usedBytes) return 0;
					var size = Math.min(stream.node.usedBytes - position, length);
					assert(size >= 0);
					if (size > 8 && contents.subarray) {
						// non-trivial, and typed array
						buffer.set(contents.subarray(position, position + size), offset);
					} else {
						for (var i = 0; i < size; i++)
							buffer[offset + i] = contents[position + i];
					}
					return size;
				},
				write(stream, buffer, offset, length, position, canOwn) {
					// The data buffer should be a typed array view
					assert(!(buffer instanceof ArrayBuffer));

					if (!length) return 0;
					var node = stream.node;
					node.mtime = node.ctime = Date.now();

					if (buffer.subarray && (!node.contents || node.contents.subarray)) {
						// This write is from a typed array to a typed array?
						if (canOwn) {
							assert(
								position === 0,
								"canOwn must imply no weird position inside the file",
							);
							node.contents = buffer.subarray(offset, offset + length);
							node.usedBytes = length;
							return length;
						} else if (node.usedBytes === 0 && position === 0) {
							// If this is a simple first write to an empty file, do a fast set since we don't need to care about old data.
							node.contents = buffer.slice(offset, offset + length);
							node.usedBytes = length;
							return length;
						} else if (position + length <= node.usedBytes) {
							// Writing to an already allocated and used subrange of the file?
							node.contents.set(
								buffer.subarray(offset, offset + length),
								position,
							);
							return length;
						}
					}

					// Appending to an existing file and we need to reallocate, or source data did not come as a typed array.
					MEMFS.expandFileStorage(node, position + length);
					if (node.contents.subarray && buffer.subarray) {
						// Use typed array write which is available.
						node.contents.set(
							buffer.subarray(offset, offset + length),
							position,
						);
					} else {
						for (var i = 0; i < length; i++) {
							node.contents[position + i] = buffer[offset + i]; // Or fall back to manual write if not.
						}
					}
					node.usedBytes = Math.max(node.usedBytes, position + length);
					return length;
				},
				llseek(stream, offset, whence) {
					var position = offset;
					if (whence === 1) {
						position += stream.position;
					} else if (whence === 2) {
						if (FS.isFile(stream.node.mode)) {
							position += stream.node.usedBytes;
						}
					}
					if (position < 0) {
						throw new FS.ErrnoError(28);
					}
					return position;
				},
				allocate(stream, offset, length) {
					MEMFS.expandFileStorage(stream.node, offset + length);
					stream.node.usedBytes = Math.max(
						stream.node.usedBytes,
						offset + length,
					);
				},
				mmap(stream, length, position, prot, flags) {
					if (!FS.isFile(stream.node.mode)) {
						throw new FS.ErrnoError(43);
					}
					var ptr;
					var allocated;
					var contents = stream.node.contents;
					// Only make a new copy when MAP_PRIVATE is specified.
					if (!(flags & 2) && contents && contents.buffer === HEAP8.buffer) {
						// We can't emulate MAP_SHARED when the file is not backed by the
						// buffer we're mapping to (e.g. the HEAP buffer).
						allocated = false;
						ptr = contents.byteOffset;
					} else {
						allocated = true;
						ptr = mmapAlloc(length);
						if (!ptr) {
							throw new FS.ErrnoError(48);
						}
						if (contents) {
							// Try to avoid unnecessary slices.
							if (position > 0 || position + length < contents.length) {
								if (contents.subarray) {
									contents = contents.subarray(position, position + length);
								} else {
									contents = Array.prototype.slice.call(
										contents,
										position,
										position + length,
									);
								}
							}
							HEAP8.set(contents, ptr);
						}
					}
					return { ptr, allocated };
				},
				msync(stream, buffer, offset, length, mmapFlags) {
					MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
					// should we check if bytesWritten and length are the same?
					return 0;
				},
			},
		};

		var asyncLoad = async (url) => {
			var arrayBuffer = await readAsync(url);
			assert(
				arrayBuffer,
				`Loading data file "${url}" failed (no arrayBuffer).`,
			);
			return new Uint8Array(arrayBuffer);
		};

		var FS_createDataFile = (
			parent,
			name,
			fileData,
			canRead,
			canWrite,
			canOwn,
		) => {
			FS.createDataFile(parent, name, fileData, canRead, canWrite, canOwn);
		};

		var preloadPlugins = Module["preloadPlugins"] || [];
		var FS_handledByPreloadPlugin = (byteArray, fullname, finish, onerror) => {
			// Ensure plugins are ready.
			if (typeof Browser != "undefined") Browser.init();

			var handled = false;
			preloadPlugins.forEach((plugin) => {
				if (handled) return;
				if (plugin["canHandle"](fullname)) {
					plugin["handle"](byteArray, fullname, finish, onerror);
					handled = true;
				}
			});
			return handled;
		};
		var FS_createPreloadedFile = (
			parent,
			name,
			url,
			canRead,
			canWrite,
			onload,
			onerror,
			dontCreateFile,
			canOwn,
			preFinish,
		) => {
			// TODO we should allow people to just pass in a complete filename instead
			// of parent and name being that we just join them anyways
			var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
			var dep = getUniqueRunDependency(`cp ${fullname}`); // might have several active requests for the same fullname
			function processData(byteArray) {
				function finish(byteArray) {
					preFinish?.();
					if (!dontCreateFile) {
						FS_createDataFile(
							parent,
							name,
							byteArray,
							canRead,
							canWrite,
							canOwn,
						);
					}
					onload?.();
					removeRunDependency(dep);
				}
				if (
					FS_handledByPreloadPlugin(byteArray, fullname, finish, () => {
						onerror?.();
						removeRunDependency(dep);
					})
				) {
					return;
				}
				finish(byteArray);
			}
			addRunDependency(dep);
			if (typeof url == "string") {
				asyncLoad(url).then(processData, onerror);
			} else {
				processData(url);
			}
		};

		var FS_modeStringToFlags = (str) => {
			var flagModes = {
				r: 0,
				"r+": 2,
				w: 512 | 64 | 1,
				"w+": 512 | 64 | 2,
				a: 1024 | 64 | 1,
				"a+": 1024 | 64 | 2,
			};
			var flags = flagModes[str];
			if (typeof flags == "undefined") {
				throw new Error(`Unknown file open mode: ${str}`);
			}
			return flags;
		};

		var FS_getMode = (canRead, canWrite) => {
			var mode = 0;
			if (canRead) mode |= 292 | 73;
			if (canWrite) mode |= 146;
			return mode;
		};

		var strError = (errno) => UTF8ToString(_strerror(errno));

		var ERRNO_CODES = {
			EPERM: 63,
			ENOENT: 44,
			ESRCH: 71,
			EINTR: 27,
			EIO: 29,
			ENXIO: 60,
			E2BIG: 1,
			ENOEXEC: 45,
			EBADF: 8,
			ECHILD: 12,
			EAGAIN: 6,
			EWOULDBLOCK: 6,
			ENOMEM: 48,
			EACCES: 2,
			EFAULT: 21,
			ENOTBLK: 105,
			EBUSY: 10,
			EEXIST: 20,
			EXDEV: 75,
			ENODEV: 43,
			ENOTDIR: 54,
			EISDIR: 31,
			EINVAL: 28,
			ENFILE: 41,
			EMFILE: 33,
			ENOTTY: 59,
			ETXTBSY: 74,
			EFBIG: 22,
			ENOSPC: 51,
			ESPIPE: 70,
			EROFS: 69,
			EMLINK: 34,
			EPIPE: 64,
			EDOM: 18,
			ERANGE: 68,
			ENOMSG: 49,
			EIDRM: 24,
			ECHRNG: 106,
			EL2NSYNC: 156,
			EL3HLT: 107,
			EL3RST: 108,
			ELNRNG: 109,
			EUNATCH: 110,
			ENOCSI: 111,
			EL2HLT: 112,
			EDEADLK: 16,
			ENOLCK: 46,
			EBADE: 113,
			EBADR: 114,
			EXFULL: 115,
			ENOANO: 104,
			EBADRQC: 103,
			EBADSLT: 102,
			EDEADLOCK: 16,
			EBFONT: 101,
			ENOSTR: 100,
			ENODATA: 116,
			ETIME: 117,
			ENOSR: 118,
			ENONET: 119,
			ENOPKG: 120,
			EREMOTE: 121,
			ENOLINK: 47,
			EADV: 122,
			ESRMNT: 123,
			ECOMM: 124,
			EPROTO: 65,
			EMULTIHOP: 36,
			EDOTDOT: 125,
			EBADMSG: 9,
			ENOTUNIQ: 126,
			EBADFD: 127,
			EREMCHG: 128,
			ELIBACC: 129,
			ELIBBAD: 130,
			ELIBSCN: 131,
			ELIBMAX: 132,
			ELIBEXEC: 133,
			ENOSYS: 52,
			ENOTEMPTY: 55,
			ENAMETOOLONG: 37,
			ELOOP: 32,
			EOPNOTSUPP: 138,
			EPFNOSUPPORT: 139,
			ECONNRESET: 15,
			ENOBUFS: 42,
			EAFNOSUPPORT: 5,
			EPROTOTYPE: 67,
			ENOTSOCK: 57,
			ENOPROTOOPT: 50,
			ESHUTDOWN: 140,
			ECONNREFUSED: 14,
			EADDRINUSE: 3,
			ECONNABORTED: 13,
			ENETUNREACH: 40,
			ENETDOWN: 38,
			ETIMEDOUT: 73,
			EHOSTDOWN: 142,
			EHOSTUNREACH: 23,
			EINPROGRESS: 26,
			EALREADY: 7,
			EDESTADDRREQ: 17,
			EMSGSIZE: 35,
			EPROTONOSUPPORT: 66,
			ESOCKTNOSUPPORT: 137,
			EADDRNOTAVAIL: 4,
			ENETRESET: 39,
			EISCONN: 30,
			ENOTCONN: 53,
			ETOOMANYREFS: 141,
			EUSERS: 136,
			EDQUOT: 19,
			ESTALE: 72,
			ENOTSUP: 138,
			ENOMEDIUM: 148,
			EILSEQ: 25,
			EOVERFLOW: 61,
			ECANCELED: 11,
			ENOTRECOVERABLE: 56,
			EOWNERDEAD: 62,
			ESTRPIPE: 135,
		};
		var FS = {
			root: null,
			mounts: [],
			devices: {},
			streams: [],
			nextInode: 1,
			nameTable: null,
			currentPath: "/",
			initialized: false,
			ignorePermissions: true,
			ErrnoError: class extends Error {
				name = "ErrnoError";
				// We set the `name` property to be able to identify `FS.ErrnoError`
				// - the `name` is a standard ECMA-262 property of error objects. Kind of good to have it anyway.
				// - when using PROXYFS, an error can come from an underlying FS
				// as different FS objects have their own FS.ErrnoError each,
				// the test `err instanceof FS.ErrnoError` won't detect an error coming from another filesystem, causing bugs.
				// we'll use the reliable test `err.name == "ErrnoError"` instead
				constructor(errno) {
					super(runtimeInitialized ? strError(errno) : "");
					this.errno = errno;
					for (var key in ERRNO_CODES) {
						if (ERRNO_CODES[key] === errno) {
							this.code = key;
							break;
						}
					}
				}
			},
			filesystems: null,
			syncFSRequests: 0,
			readFiles: {},
			FSStream: class {
				shared = {};
				get object() {
					return this.node;
				}
				set object(val) {
					this.node = val;
				}
				get isRead() {
					return (this.flags & 2097155) !== 1;
				}
				get isWrite() {
					return (this.flags & 2097155) !== 0;
				}
				get isAppend() {
					return this.flags & 1024;
				}
				get flags() {
					return this.shared.flags;
				}
				set flags(val) {
					this.shared.flags = val;
				}
				get position() {
					return this.shared.position;
				}
				set position(val) {
					this.shared.position = val;
				}
			},
			FSNode: class {
				node_ops = {};
				stream_ops = {};
				readMode = 292 | 73;
				writeMode = 146;
				mounted = null;
				constructor(parent, name, mode, rdev) {
					if (!parent) {
						parent = this; // root node sets parent to itself
					}
					this.parent = parent;
					this.mount = parent.mount;
					this.id = FS.nextInode++;
					this.name = name;
					this.mode = mode;
					this.rdev = rdev;
					this.atime = this.mtime = this.ctime = Date.now();
				}
				get read() {
					return (this.mode & this.readMode) === this.readMode;
				}
				set read(val) {
					val ? (this.mode |= this.readMode) : (this.mode &= ~this.readMode);
				}
				get write() {
					return (this.mode & this.writeMode) === this.writeMode;
				}
				set write(val) {
					val ? (this.mode |= this.writeMode) : (this.mode &= ~this.writeMode);
				}
				get isFolder() {
					return FS.isDir(this.mode);
				}
				get isDevice() {
					return FS.isChrdev(this.mode);
				}
			},
			lookupPath(path, opts = {}) {
				if (!path) return { path: "", node: null };
				opts.follow_mount ??= true;

				if (!PATH.isAbs(path)) {
					path = FS.cwd() + "/" + path;
				}

				// limit max consecutive symlinks to 40 (SYMLOOP_MAX).
				linkloop: for (var nlinks = 0; nlinks < 40; nlinks++) {
					// split the absolute path
					var parts = path.split("/").filter((p) => !!p && p !== ".");

					// start at the root
					var current = FS.root;
					var current_path = "/";

					for (var i = 0; i < parts.length; i++) {
						var islast = i === parts.length - 1;
						if (islast && opts.parent) {
							// stop resolving
							break;
						}

						if (parts[i] === "..") {
							current_path = PATH.dirname(current_path);
							current = current.parent;
							continue;
						}

						current_path = PATH.join2(current_path, parts[i]);
						try {
							current = FS.lookupNode(current, parts[i]);
						} catch (e) {
							// if noent_okay is true, suppress a ENOENT in the last component
							// and return an object with an undefined node. This is needed for
							// resolving symlinks in the path when creating a file.
							if (e?.errno === 44 && islast && opts.noent_okay) {
								return { path: current_path };
							}
							throw e;
						}

						// jump to the mount's root node if this is a mountpoint
						if (FS.isMountpoint(current) && (!islast || opts.follow_mount)) {
							current = current.mounted.root;
						}

						// by default, lookupPath will not follow a symlink if it is the final path component.
						// setting opts.follow = true will override this behavior.
						if (FS.isLink(current.mode) && (!islast || opts.follow)) {
							if (!current.node_ops.readlink) {
								throw new FS.ErrnoError(52);
							}
							var link = current.node_ops.readlink(current);
							if (!PATH.isAbs(link)) {
								link = PATH.dirname(current_path) + "/" + link;
							}
							path = link + "/" + parts.slice(i + 1).join("/");
							continue linkloop;
						}
					}
					return { path: current_path, node: current };
				}
				throw new FS.ErrnoError(32);
			},
			getPath(node) {
				var path;
				while (true) {
					if (FS.isRoot(node)) {
						var mount = node.mount.mountpoint;
						if (!path) return mount;
						return mount[mount.length - 1] !== "/"
							? `${mount}/${path}`
							: mount + path;
					}
					path = path ? `${node.name}/${path}` : node.name;
					node = node.parent;
				}
			},
			hashName(parentid, name) {
				var hash = 0;

				for (var i = 0; i < name.length; i++) {
					hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
				}
				return ((parentid + hash) >>> 0) % FS.nameTable.length;
			},
			hashAddNode(node) {
				var hash = FS.hashName(node.parent.id, node.name);
				node.name_next = FS.nameTable[hash];
				FS.nameTable[hash] = node;
			},
			hashRemoveNode(node) {
				var hash = FS.hashName(node.parent.id, node.name);
				if (FS.nameTable[hash] === node) {
					FS.nameTable[hash] = node.name_next;
				} else {
					var current = FS.nameTable[hash];
					while (current) {
						if (current.name_next === node) {
							current.name_next = node.name_next;
							break;
						}
						current = current.name_next;
					}
				}
			},
			lookupNode(parent, name) {
				var errCode = FS.mayLookup(parent);
				if (errCode) {
					throw new FS.ErrnoError(errCode);
				}
				var hash = FS.hashName(parent.id, name);
				for (var node = FS.nameTable[hash]; node; node = node.name_next) {
					var nodeName = node.name;
					if (node.parent.id === parent.id && nodeName === name) {
						return node;
					}
				}
				// if we failed to find it in the cache, call into the VFS
				return FS.lookup(parent, name);
			},
			createNode(parent, name, mode, rdev) {
				assert(typeof parent == "object");
				var node = new FS.FSNode(parent, name, mode, rdev);

				FS.hashAddNode(node);

				return node;
			},
			destroyNode(node) {
				FS.hashRemoveNode(node);
			},
			isRoot(node) {
				return node === node.parent;
			},
			isMountpoint(node) {
				return !!node.mounted;
			},
			isFile(mode) {
				return (mode & 61440) === 32768;
			},
			isDir(mode) {
				return (mode & 61440) === 16384;
			},
			isLink(mode) {
				return (mode & 61440) === 40960;
			},
			isChrdev(mode) {
				return (mode & 61440) === 8192;
			},
			isBlkdev(mode) {
				return (mode & 61440) === 24576;
			},
			isFIFO(mode) {
				return (mode & 61440) === 4096;
			},
			isSocket(mode) {
				return (mode & 49152) === 49152;
			},
			flagsToPermissionString(flag) {
				var perms = ["r", "w", "rw"][flag & 3];
				if (flag & 512) {
					perms += "w";
				}
				return perms;
			},
			nodePermissions(node, perms) {
				if (FS.ignorePermissions) {
					return 0;
				}
				// return 0 if any user, group or owner bits are set.
				if (perms.includes("r") && !(node.mode & 292)) {
					return 2;
				} else if (perms.includes("w") && !(node.mode & 146)) {
					return 2;
				} else if (perms.includes("x") && !(node.mode & 73)) {
					return 2;
				}
				return 0;
			},
			mayLookup(dir) {
				if (!FS.isDir(dir.mode)) return 54;
				var errCode = FS.nodePermissions(dir, "x");
				if (errCode) return errCode;
				if (!dir.node_ops.lookup) return 2;
				return 0;
			},
			mayCreate(dir, name) {
				if (!FS.isDir(dir.mode)) {
					return 54;
				}
				try {
					var node = FS.lookupNode(dir, name);
					return 20;
				} catch (e) {}
				return FS.nodePermissions(dir, "wx");
			},
			mayDelete(dir, name, isdir) {
				var node;
				try {
					node = FS.lookupNode(dir, name);
				} catch (e) {
					return e.errno;
				}
				var errCode = FS.nodePermissions(dir, "wx");
				if (errCode) {
					return errCode;
				}
				if (isdir) {
					if (!FS.isDir(node.mode)) {
						return 54;
					}
					if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
						return 10;
					}
				} else {
					if (FS.isDir(node.mode)) {
						return 31;
					}
				}
				return 0;
			},
			mayOpen(node, flags) {
				if (!node) {
					return 44;
				}
				if (FS.isLink(node.mode)) {
					return 32;
				} else if (FS.isDir(node.mode)) {
					if (
						FS.flagsToPermissionString(flags) !== "r" || // opening for write
						flags & 512
					) {
						// TODO: check for O_SEARCH? (== search for dir only)
						return 31;
					}
				}
				return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
			},
			MAX_OPEN_FDS: 4096,
			nextfd() {
				for (var fd = 0; fd <= FS.MAX_OPEN_FDS; fd++) {
					if (!FS.streams[fd]) {
						return fd;
					}
				}
				throw new FS.ErrnoError(33);
			},
			getStreamChecked(fd) {
				var stream = FS.getStream(fd);
				if (!stream) {
					throw new FS.ErrnoError(8);
				}
				return stream;
			},
			getStream: (fd) => FS.streams[fd],
			createStream(stream, fd = -1) {
				assert(fd >= -1);

				// clone it, so we can return an instance of FSStream
				stream = Object.assign(new FS.FSStream(), stream);
				if (fd == -1) {
					fd = FS.nextfd();
				}
				stream.fd = fd;
				FS.streams[fd] = stream;
				return stream;
			},
			closeStream(fd) {
				FS.streams[fd] = null;
			},
			dupStream(origStream, fd = -1) {
				var stream = FS.createStream(origStream, fd);
				stream.stream_ops?.dup?.(stream);
				return stream;
			},
			chrdev_stream_ops: {
				open(stream) {
					var device = FS.getDevice(stream.node.rdev);
					// override node's stream ops with the device's
					stream.stream_ops = device.stream_ops;
					// forward the open call
					stream.stream_ops.open?.(stream);
				},
				llseek() {
					throw new FS.ErrnoError(70);
				},
			},
			major: (dev) => dev >> 8,
			minor: (dev) => dev & 0xff,
			makedev: (ma, mi) => (ma << 8) | mi,
			registerDevice(dev, ops) {
				FS.devices[dev] = { stream_ops: ops };
			},
			getDevice: (dev) => FS.devices[dev],
			getMounts(mount) {
				var mounts = [];
				var check = [mount];

				while (check.length) {
					var m = check.pop();

					mounts.push(m);

					check.push(...m.mounts);
				}

				return mounts;
			},
			syncfs(populate, callback) {
				if (typeof populate == "function") {
					callback = populate;
					populate = false;
				}

				FS.syncFSRequests++;

				if (FS.syncFSRequests > 1) {
					err(
						`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`,
					);
				}

				var mounts = FS.getMounts(FS.root.mount);
				var completed = 0;

				function doCallback(errCode) {
					assert(FS.syncFSRequests > 0);
					FS.syncFSRequests--;
					return callback(errCode);
				}

				function done(errCode) {
					if (errCode) {
						if (!done.errored) {
							done.errored = true;
							return doCallback(errCode);
						}
						return;
					}
					if (++completed >= mounts.length) {
						doCallback(null);
					}
				}

				// sync all mounts
				mounts.forEach((mount) => {
					if (!mount.type.syncfs) {
						return done(null);
					}
					mount.type.syncfs(mount, populate, done);
				});
			},
			mount(type, opts, mountpoint) {
				if (typeof type == "string") {
					// The filesystem was not included, and instead we have an error
					// message stored in the variable.
					throw type;
				}
				var root = mountpoint === "/";
				var pseudo = !mountpoint;
				var node;

				if (root && FS.root) {
					throw new FS.ErrnoError(10);
				} else if (!root && !pseudo) {
					var lookup = FS.lookupPath(mountpoint, { follow_mount: false });

					mountpoint = lookup.path; // use the absolute path
					node = lookup.node;

					if (FS.isMountpoint(node)) {
						throw new FS.ErrnoError(10);
					}

					if (!FS.isDir(node.mode)) {
						throw new FS.ErrnoError(54);
					}
				}

				var mount = {
					type,
					opts,
					mountpoint,
					mounts: [],
				};

				// create a root node for the fs
				var mountRoot = type.mount(mount);
				mountRoot.mount = mount;
				mount.root = mountRoot;

				if (root) {
					FS.root = mountRoot;
				} else if (node) {
					// set as a mountpoint
					node.mounted = mount;

					// add the new mount to the current mount's children
					if (node.mount) {
						node.mount.mounts.push(mount);
					}
				}

				return mountRoot;
			},
			unmount(mountpoint) {
				var lookup = FS.lookupPath(mountpoint, { follow_mount: false });

				if (!FS.isMountpoint(lookup.node)) {
					throw new FS.ErrnoError(28);
				}

				// destroy the nodes for this mount, and all its child mounts
				var node = lookup.node;
				var mount = node.mounted;
				var mounts = FS.getMounts(mount);

				Object.keys(FS.nameTable).forEach((hash) => {
					var current = FS.nameTable[hash];

					while (current) {
						var next = current.name_next;

						if (mounts.includes(current.mount)) {
							FS.destroyNode(current);
						}

						current = next;
					}
				});

				// no longer a mountpoint
				node.mounted = null;

				// remove this mount from the child mounts
				var idx = node.mount.mounts.indexOf(mount);
				assert(idx !== -1);
				node.mount.mounts.splice(idx, 1);
			},
			lookup(parent, name) {
				return parent.node_ops.lookup(parent, name);
			},
			mknod(path, mode, dev) {
				var lookup = FS.lookupPath(path, { parent: true });
				var parent = lookup.node;
				var name = PATH.basename(path);
				if (!name || name === "." || name === "..") {
					throw new FS.ErrnoError(28);
				}
				var errCode = FS.mayCreate(parent, name);
				if (errCode) {
					throw new FS.ErrnoError(errCode);
				}
				if (!parent.node_ops.mknod) {
					throw new FS.ErrnoError(63);
				}
				return parent.node_ops.mknod(parent, name, mode, dev);
			},
			statfs(path) {
				// NOTE: None of the defaults here are true. We're just returning safe and
				//       sane values.
				var rtn = {
					bsize: 4096,
					frsize: 4096,
					blocks: 1e6,
					bfree: 5e5,
					bavail: 5e5,
					files: FS.nextInode,
					ffree: FS.nextInode - 1,
					fsid: 42,
					flags: 2,
					namelen: 255,
				};

				var parent = FS.lookupPath(path, { follow: true }).node;
				if (parent?.node_ops.statfs) {
					Object.assign(rtn, parent.node_ops.statfs(parent.mount.opts.root));
				}
				return rtn;
			},
			create(path, mode = 0o666) {
				mode &= 4095;
				mode |= 32768;
				return FS.mknod(path, mode, 0);
			},
			mkdir(path, mode = 0o777) {
				mode &= 511 | 512;
				mode |= 16384;
				return FS.mknod(path, mode, 0);
			},
			mkdirTree(path, mode) {
				var dirs = path.split("/");
				var d = "";
				for (var i = 0; i < dirs.length; ++i) {
					if (!dirs[i]) continue;
					d += "/" + dirs[i];
					try {
						FS.mkdir(d, mode);
					} catch (e) {
						if (e.errno != 20) throw e;
					}
				}
			},
			mkdev(path, mode, dev) {
				if (typeof dev == "undefined") {
					dev = mode;
					mode = 0o666;
				}
				mode |= 8192;
				return FS.mknod(path, mode, dev);
			},
			symlink(oldpath, newpath) {
				if (!PATH_FS.resolve(oldpath)) {
					throw new FS.ErrnoError(44);
				}
				var lookup = FS.lookupPath(newpath, { parent: true });
				var parent = lookup.node;
				if (!parent) {
					throw new FS.ErrnoError(44);
				}
				var newname = PATH.basename(newpath);
				var errCode = FS.mayCreate(parent, newname);
				if (errCode) {
					throw new FS.ErrnoError(errCode);
				}
				if (!parent.node_ops.symlink) {
					throw new FS.ErrnoError(63);
				}
				return parent.node_ops.symlink(parent, newname, oldpath);
			},
			rename(old_path, new_path) {
				var old_dirname = PATH.dirname(old_path);
				var new_dirname = PATH.dirname(new_path);
				var old_name = PATH.basename(old_path);
				var new_name = PATH.basename(new_path);
				// parents must exist
				var lookup, old_dir, new_dir;

				// let the errors from non existent directories percolate up
				lookup = FS.lookupPath(old_path, { parent: true });
				old_dir = lookup.node;
				lookup = FS.lookupPath(new_path, { parent: true });
				new_dir = lookup.node;

				if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
				// need to be part of the same mount
				if (old_dir.mount !== new_dir.mount) {
					throw new FS.ErrnoError(75);
				}
				// source must exist
				var old_node = FS.lookupNode(old_dir, old_name);
				// old path should not be an ancestor of the new path
				var relative = PATH_FS.relative(old_path, new_dirname);
				if (relative.charAt(0) !== ".") {
					throw new FS.ErrnoError(28);
				}
				// new path should not be an ancestor of the old path
				relative = PATH_FS.relative(new_path, old_dirname);
				if (relative.charAt(0) !== ".") {
					throw new FS.ErrnoError(55);
				}
				// see if the new path already exists
				var new_node;
				try {
					new_node = FS.lookupNode(new_dir, new_name);
				} catch (e) {
					// not fatal
				}
				// early out if nothing needs to change
				if (old_node === new_node) {
					return;
				}
				// we'll need to delete the old entry
				var isdir = FS.isDir(old_node.mode);
				var errCode = FS.mayDelete(old_dir, old_name, isdir);
				if (errCode) {
					throw new FS.ErrnoError(errCode);
				}
				// need delete permissions if we'll be overwriting.
				// need create permissions if new doesn't already exist.
				errCode = new_node
					? FS.mayDelete(new_dir, new_name, isdir)
					: FS.mayCreate(new_dir, new_name);
				if (errCode) {
					throw new FS.ErrnoError(errCode);
				}
				if (!old_dir.node_ops.rename) {
					throw new FS.ErrnoError(63);
				}
				if (
					FS.isMountpoint(old_node) ||
					(new_node && FS.isMountpoint(new_node))
				) {
					throw new FS.ErrnoError(10);
				}
				// if we are going to change the parent, check write permissions
				if (new_dir !== old_dir) {
					errCode = FS.nodePermissions(old_dir, "w");
					if (errCode) {
						throw new FS.ErrnoError(errCode);
					}
				}
				// remove the node from the lookup hash
				FS.hashRemoveNode(old_node);
				// do the underlying fs rename
				try {
					old_dir.node_ops.rename(old_node, new_dir, new_name);
					// update old node (we do this here to avoid each backend
					// needing to)
					old_node.parent = new_dir;
				} catch (e) {
					throw e;
				} finally {
					// add the node back to the hash (in case node_ops.rename
					// changed its name)
					FS.hashAddNode(old_node);
				}
			},
			rmdir(path) {
				var lookup = FS.lookupPath(path, { parent: true });
				var parent = lookup.node;
				var name = PATH.basename(path);
				var node = FS.lookupNode(parent, name);
				var errCode = FS.mayDelete(parent, name, true);
				if (errCode) {
					throw new FS.ErrnoError(errCode);
				}
				if (!parent.node_ops.rmdir) {
					throw new FS.ErrnoError(63);
				}
				if (FS.isMountpoint(node)) {
					throw new FS.ErrnoError(10);
				}
				parent.node_ops.rmdir(parent, name);
				FS.destroyNode(node);
			},
			readdir(path) {
				var lookup = FS.lookupPath(path, { follow: true });
				var node = lookup.node;
				if (!node.node_ops.readdir) {
					throw new FS.ErrnoError(54);
				}
				return node.node_ops.readdir(node);
			},
			unlink(path) {
				var lookup = FS.lookupPath(path, { parent: true });
				var parent = lookup.node;
				if (!parent) {
					throw new FS.ErrnoError(44);
				}
				var name = PATH.basename(path);
				var node = FS.lookupNode(parent, name);
				var errCode = FS.mayDelete(parent, name, false);
				if (errCode) {
					// According to POSIX, we should map EISDIR to EPERM, but
					// we instead do what Linux does (and we must, as we use
					// the musl linux libc).
					throw new FS.ErrnoError(errCode);
				}
				if (!parent.node_ops.unlink) {
					throw new FS.ErrnoError(63);
				}
				if (FS.isMountpoint(node)) {
					throw new FS.ErrnoError(10);
				}
				parent.node_ops.unlink(parent, name);
				FS.destroyNode(node);
			},
			readlink(path) {
				var lookup = FS.lookupPath(path);
				var link = lookup.node;
				if (!link) {
					throw new FS.ErrnoError(44);
				}
				if (!link.node_ops.readlink) {
					throw new FS.ErrnoError(28);
				}
				return link.node_ops.readlink(link);
			},
			stat(path, dontFollow) {
				var lookup = FS.lookupPath(path, { follow: !dontFollow });
				var node = lookup.node;
				if (!node) {
					throw new FS.ErrnoError(44);
				}
				if (!node.node_ops.getattr) {
					throw new FS.ErrnoError(63);
				}
				return node.node_ops.getattr(node);
			},
			lstat(path) {
				return FS.stat(path, true);
			},
			chmod(path, mode, dontFollow) {
				var node;
				if (typeof path == "string") {
					var lookup = FS.lookupPath(path, { follow: !dontFollow });
					node = lookup.node;
				} else {
					node = path;
				}
				if (!node.node_ops.setattr) {
					throw new FS.ErrnoError(63);
				}
				node.node_ops.setattr(node, {
					mode: (mode & 4095) | (node.mode & ~4095),
					ctime: Date.now(),
				});
			},
			lchmod(path, mode) {
				FS.chmod(path, mode, true);
			},
			fchmod(fd, mode) {
				var stream = FS.getStreamChecked(fd);
				FS.chmod(stream.node, mode);
			},
			chown(path, uid, gid, dontFollow) {
				var node;
				if (typeof path == "string") {
					var lookup = FS.lookupPath(path, { follow: !dontFollow });
					node = lookup.node;
				} else {
					node = path;
				}
				if (!node.node_ops.setattr) {
					throw new FS.ErrnoError(63);
				}
				node.node_ops.setattr(node, {
					timestamp: Date.now(),
					// we ignore the uid / gid for now
				});
			},
			lchown(path, uid, gid) {
				FS.chown(path, uid, gid, true);
			},
			fchown(fd, uid, gid) {
				var stream = FS.getStreamChecked(fd);
				FS.chown(stream.node, uid, gid);
			},
			truncate(path, len) {
				if (len < 0) {
					throw new FS.ErrnoError(28);
				}
				var node;
				if (typeof path == "string") {
					var lookup = FS.lookupPath(path, { follow: true });
					node = lookup.node;
				} else {
					node = path;
				}
				if (!node.node_ops.setattr) {
					throw new FS.ErrnoError(63);
				}
				if (FS.isDir(node.mode)) {
					throw new FS.ErrnoError(31);
				}
				if (!FS.isFile(node.mode)) {
					throw new FS.ErrnoError(28);
				}
				var errCode = FS.nodePermissions(node, "w");
				if (errCode) {
					throw new FS.ErrnoError(errCode);
				}
				node.node_ops.setattr(node, {
					size: len,
					timestamp: Date.now(),
				});
			},
			ftruncate(fd, len) {
				var stream = FS.getStreamChecked(fd);
				if ((stream.flags & 2097155) === 0) {
					throw new FS.ErrnoError(28);
				}
				FS.truncate(stream.node, len);
			},
			utime(path, atime, mtime) {
				var lookup = FS.lookupPath(path, { follow: true });
				var node = lookup.node;
				node.node_ops.setattr(node, {
					atime: atime,
					mtime: mtime,
				});
			},
			open(path, flags, mode = 0o666) {
				if (path === "") {
					throw new FS.ErrnoError(44);
				}
				flags = typeof flags == "string" ? FS_modeStringToFlags(flags) : flags;
				if (flags & 64) {
					mode = (mode & 4095) | 32768;
				} else {
					mode = 0;
				}
				var node;
				if (typeof path == "object") {
					node = path;
				} else {
					// noent_okay makes it so that if the final component of the path
					// doesn't exist, lookupPath returns `node: undefined`. `path` will be
					// updated to point to the target of all symlinks.
					var lookup = FS.lookupPath(path, {
						follow: !(flags & 131072),
						noent_okay: true,
					});
					node = lookup.node;
					path = lookup.path;
				}
				// perhaps we need to create the node
				var created = false;
				if (flags & 64) {
					if (node) {
						// if O_CREAT and O_EXCL are set, error out if the node already exists
						if (flags & 128) {
							throw new FS.ErrnoError(20);
						}
					} else {
						// node doesn't exist, try to create it
						node = FS.mknod(path, mode, 0);
						created = true;
					}
				}
				if (!node) {
					throw new FS.ErrnoError(44);
				}
				// can't truncate a device
				if (FS.isChrdev(node.mode)) {
					flags &= ~512;
				}
				// if asked only for a directory, then this must be one
				if (flags & 65536 && !FS.isDir(node.mode)) {
					throw new FS.ErrnoError(54);
				}
				// check permissions, if this is not a file we just created now (it is ok to
				// create and write to a file with read-only permissions; it is read-only
				// for later use)
				if (!created) {
					var errCode = FS.mayOpen(node, flags);
					if (errCode) {
						throw new FS.ErrnoError(errCode);
					}
				}
				// do truncation if necessary
				if (flags & 512 && !created) {
					FS.truncate(node, 0);
				}
				// we've already handled these, don't pass down to the underlying vfs
				flags &= ~(128 | 512 | 131072);

				// register the stream with the filesystem
				var stream = FS.createStream({
					node,
					path: FS.getPath(node), // we want the absolute path to the node
					flags,
					seekable: true,
					position: 0,
					stream_ops: node.stream_ops,
					// used by the file family libc calls (fopen, fwrite, ferror, etc.)
					ungotten: [],
					error: false,
				});
				// call the new stream's open function
				if (stream.stream_ops.open) {
					stream.stream_ops.open(stream);
				}
				if (Module["logReadFiles"] && !(flags & 1)) {
					if (!(path in FS.readFiles)) {
						FS.readFiles[path] = 1;
					}
				}
				return stream;
			},
			close(stream) {
				if (FS.isClosed(stream)) {
					throw new FS.ErrnoError(8);
				}
				if (stream.getdents) stream.getdents = null; // free readdir state
				try {
					if (stream.stream_ops.close) {
						stream.stream_ops.close(stream);
					}
				} catch (e) {
					throw e;
				} finally {
					FS.closeStream(stream.fd);
				}
				stream.fd = null;
			},
			isClosed(stream) {
				return stream.fd === null;
			},
			llseek(stream, offset, whence) {
				if (FS.isClosed(stream)) {
					throw new FS.ErrnoError(8);
				}
				if (!stream.seekable || !stream.stream_ops.llseek) {
					throw new FS.ErrnoError(70);
				}
				if (whence != 0 && whence != 1 && whence != 2) {
					throw new FS.ErrnoError(28);
				}
				stream.position = stream.stream_ops.llseek(stream, offset, whence);
				stream.ungotten = [];
				return stream.position;
			},
			read(stream, buffer, offset, length, position) {
				assert(offset >= 0);
				if (length < 0 || position < 0) {
					throw new FS.ErrnoError(28);
				}
				if (FS.isClosed(stream)) {
					throw new FS.ErrnoError(8);
				}
				if ((stream.flags & 2097155) === 1) {
					throw new FS.ErrnoError(8);
				}
				if (FS.isDir(stream.node.mode)) {
					throw new FS.ErrnoError(31);
				}
				if (!stream.stream_ops.read) {
					throw new FS.ErrnoError(28);
				}
				var seeking = typeof position != "undefined";
				if (!seeking) {
					position = stream.position;
				} else if (!stream.seekable) {
					throw new FS.ErrnoError(70);
				}
				var bytesRead = stream.stream_ops.read(
					stream,
					buffer,
					offset,
					length,
					position,
				);
				if (!seeking) stream.position += bytesRead;
				return bytesRead;
			},
			write(stream, buffer, offset, length, position, canOwn) {
				assert(offset >= 0);
				if (length < 0 || position < 0) {
					throw new FS.ErrnoError(28);
				}
				if (FS.isClosed(stream)) {
					throw new FS.ErrnoError(8);
				}
				if ((stream.flags & 2097155) === 0) {
					throw new FS.ErrnoError(8);
				}
				if (FS.isDir(stream.node.mode)) {
					throw new FS.ErrnoError(31);
				}
				if (!stream.stream_ops.write) {
					throw new FS.ErrnoError(28);
				}
				if (stream.seekable && stream.flags & 1024) {
					// seek to the end before writing in append mode
					FS.llseek(stream, 0, 2);
				}
				var seeking = typeof position != "undefined";
				if (!seeking) {
					position = stream.position;
				} else if (!stream.seekable) {
					throw new FS.ErrnoError(70);
				}
				var bytesWritten = stream.stream_ops.write(
					stream,
					buffer,
					offset,
					length,
					position,
					canOwn,
				);
				if (!seeking) stream.position += bytesWritten;
				return bytesWritten;
			},
			allocate(stream, offset, length) {
				if (FS.isClosed(stream)) {
					throw new FS.ErrnoError(8);
				}
				if (offset < 0 || length <= 0) {
					throw new FS.ErrnoError(28);
				}
				if ((stream.flags & 2097155) === 0) {
					throw new FS.ErrnoError(8);
				}
				if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
					throw new FS.ErrnoError(43);
				}
				if (!stream.stream_ops.allocate) {
					throw new FS.ErrnoError(138);
				}
				stream.stream_ops.allocate(stream, offset, length);
			},
			mmap(stream, length, position, prot, flags) {
				// User requests writing to file (prot & PROT_WRITE != 0).
				// Checking if we have permissions to write to the file unless
				// MAP_PRIVATE flag is set. According to POSIX spec it is possible
				// to write to file opened in read-only mode with MAP_PRIVATE flag,
				// as all modifications will be visible only in the memory of
				// the current process.
				if (
					(prot & 2) !== 0 &&
					(flags & 2) === 0 &&
					(stream.flags & 2097155) !== 2
				) {
					throw new FS.ErrnoError(2);
				}
				if ((stream.flags & 2097155) === 1) {
					throw new FS.ErrnoError(2);
				}
				if (!stream.stream_ops.mmap) {
					throw new FS.ErrnoError(43);
				}
				if (!length) {
					throw new FS.ErrnoError(28);
				}
				return stream.stream_ops.mmap(stream, length, position, prot, flags);
			},
			msync(stream, buffer, offset, length, mmapFlags) {
				assert(offset >= 0);
				if (!stream.stream_ops.msync) {
					return 0;
				}
				return stream.stream_ops.msync(
					stream,
					buffer,
					offset,
					length,
					mmapFlags,
				);
			},
			ioctl(stream, cmd, arg) {
				if (!stream.stream_ops.ioctl) {
					throw new FS.ErrnoError(59);
				}
				return stream.stream_ops.ioctl(stream, cmd, arg);
			},
			readFile(path, opts = {}) {
				opts.flags = opts.flags || 0;
				opts.encoding = opts.encoding || "binary";
				if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
					throw new Error(`Invalid encoding type "${opts.encoding}"`);
				}
				var ret;
				var stream = FS.open(path, opts.flags);
				var stat = FS.stat(path);
				var length = stat.size;
				var buf = new Uint8Array(length);
				FS.read(stream, buf, 0, length, 0);
				if (opts.encoding === "utf8") {
					ret = UTF8ArrayToString(buf);
				} else if (opts.encoding === "binary") {
					ret = buf;
				}
				FS.close(stream);
				return ret;
			},
			writeFile(path, data, opts = {}) {
				opts.flags = opts.flags || 577;
				var stream = FS.open(path, opts.flags, opts.mode);
				if (typeof data == "string") {
					var buf = new Uint8Array(lengthBytesUTF8(data) + 1);
					var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
					FS.write(stream, buf, 0, actualNumBytes, undefined, opts.canOwn);
				} else if (ArrayBuffer.isView(data)) {
					FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
				} else {
					throw new Error("Unsupported data type");
				}
				FS.close(stream);
			},
			cwd: () => FS.currentPath,
			chdir(path) {
				var lookup = FS.lookupPath(path, { follow: true });
				if (lookup.node === null) {
					throw new FS.ErrnoError(44);
				}
				if (!FS.isDir(lookup.node.mode)) {
					throw new FS.ErrnoError(54);
				}
				var errCode = FS.nodePermissions(lookup.node, "x");
				if (errCode) {
					throw new FS.ErrnoError(errCode);
				}
				FS.currentPath = lookup.path;
			},
			createDefaultDirectories() {
				FS.mkdir("/tmp");
				FS.mkdir("/home");
				FS.mkdir("/home/web_user");
			},
			createDefaultDevices() {
				// create /dev
				FS.mkdir("/dev");
				// setup /dev/null
				FS.registerDevice(FS.makedev(1, 3), {
					read: () => 0,
					write: (stream, buffer, offset, length, pos) => length,
					llseek: () => 0,
				});
				FS.mkdev("/dev/null", FS.makedev(1, 3));
				// setup /dev/tty and /dev/tty1
				// stderr needs to print output using err() rather than out()
				// so we register a second tty just for it.
				TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
				TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
				FS.mkdev("/dev/tty", FS.makedev(5, 0));
				FS.mkdev("/dev/tty1", FS.makedev(6, 0));
				// setup /dev/[u]random
				// use a buffer to avoid overhead of individual crypto calls per byte
				var randomBuffer = new Uint8Array(1024),
					randomLeft = 0;
				var randomByte = () => {
					if (randomLeft === 0) {
						randomLeft = randomFill(randomBuffer).byteLength;
					}
					return randomBuffer[--randomLeft];
				};
				FS.createDevice("/dev", "random", randomByte);
				FS.createDevice("/dev", "urandom", randomByte);
				// we're not going to emulate the actual shm device,
				// just create the tmp dirs that reside in it commonly
				FS.mkdir("/dev/shm");
				FS.mkdir("/dev/shm/tmp");
			},
			createSpecialDirectories() {
				// create /proc/self/fd which allows /proc/self/fd/6 => readlink gives the
				// name of the stream for fd 6 (see test_unistd_ttyname)
				FS.mkdir("/proc");
				var proc_self = FS.mkdir("/proc/self");
				FS.mkdir("/proc/self/fd");
				FS.mount(
					{
						mount() {
							var node = FS.createNode(proc_self, "fd", 16895, 73);
							node.stream_ops = {
								llseek: MEMFS.stream_ops.llseek,
							};
							node.node_ops = {
								lookup(parent, name) {
									var fd = +name;
									var stream = FS.getStreamChecked(fd);
									var ret = {
										parent: null,
										mount: { mountpoint: "fake" },
										node_ops: { readlink: () => stream.path },
										id: fd + 1,
									};
									ret.parent = ret; // make it look like a simple root node
									return ret;
								},
								readdir() {
									return Array.from(FS.streams.entries())
										.filter(([k, v]) => v)
										.map(([k, v]) => k.toString());
								},
							};
							return node;
						},
					},
					{},
					"/proc/self/fd",
				);
			},
			createStandardStreams(input, output, error) {
				// TODO deprecate the old functionality of a single
				// input / output callback and that utilizes FS.createDevice
				// and instead require a unique set of stream ops

				// by default, we symlink the standard streams to the
				// default tty devices. however, if the standard streams
				// have been overwritten we create a unique device for
				// them instead.
				if (input) {
					FS.createDevice("/dev", "stdin", input);
				} else {
					FS.symlink("/dev/tty", "/dev/stdin");
				}
				if (output) {
					FS.createDevice("/dev", "stdout", null, output);
				} else {
					FS.symlink("/dev/tty", "/dev/stdout");
				}
				if (error) {
					FS.createDevice("/dev", "stderr", null, error);
				} else {
					FS.symlink("/dev/tty1", "/dev/stderr");
				}

				// open default streams for the stdin, stdout and stderr devices
				var stdin = FS.open("/dev/stdin", 0);
				var stdout = FS.open("/dev/stdout", 1);
				var stderr = FS.open("/dev/stderr", 1);
				assert(stdin.fd === 0, `invalid handle for stdin (${stdin.fd})`);
				assert(stdout.fd === 1, `invalid handle for stdout (${stdout.fd})`);
				assert(stderr.fd === 2, `invalid handle for stderr (${stderr.fd})`);
			},
			staticInit() {
				FS.nameTable = new Array(4096);

				FS.mount(MEMFS, {}, "/");

				FS.createDefaultDirectories();
				FS.createDefaultDevices();
				FS.createSpecialDirectories();

				FS.filesystems = {
					MEMFS: MEMFS,
				};
			},
			init(input, output, error) {
				assert(
					!FS.initialized,
					"FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)",
				);
				FS.initialized = true;

				// Allow Module.stdin etc. to provide defaults, if none explicitly passed to us here
				input ??= Module["stdin"];
				output ??= Module["stdout"];
				error ??= Module["stderr"];

				FS.createStandardStreams(input, output, error);
			},
			quit() {
				FS.initialized = false;
				// force-flush all streams, so we get musl std streams printed out
				_fflush(0);
				// close all of our streams
				for (var i = 0; i < FS.streams.length; i++) {
					var stream = FS.streams[i];
					if (!stream) {
						continue;
					}
					FS.close(stream);
				}
			},
			findObject(path, dontResolveLastLink) {
				var ret = FS.analyzePath(path, dontResolveLastLink);
				if (!ret.exists) {
					return null;
				}
				return ret.object;
			},
			analyzePath(path, dontResolveLastLink) {
				// operate from within the context of the symlink's target
				try {
					var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
					path = lookup.path;
				} catch (e) {}
				var ret = {
					isRoot: false,
					exists: false,
					error: 0,
					name: null,
					path: null,
					object: null,
					parentExists: false,
					parentPath: null,
					parentObject: null,
				};
				try {
					var lookup = FS.lookupPath(path, { parent: true });
					ret.parentExists = true;
					ret.parentPath = lookup.path;
					ret.parentObject = lookup.node;
					ret.name = PATH.basename(path);
					lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
					ret.exists = true;
					ret.path = lookup.path;
					ret.object = lookup.node;
					ret.name = lookup.node.name;
					ret.isRoot = lookup.path === "/";
				} catch (e) {
					ret.error = e.errno;
				}
				return ret;
			},
			createPath(parent, path, canRead, canWrite) {
				parent = typeof parent == "string" ? parent : FS.getPath(parent);
				var parts = path.split("/").reverse();
				while (parts.length) {
					var part = parts.pop();
					if (!part) continue;
					var current = PATH.join2(parent, part);
					try {
						FS.mkdir(current);
					} catch (e) {
						// ignore EEXIST
					}
					parent = current;
				}
				return current;
			},
			createFile(parent, name, properties, canRead, canWrite) {
				var path = PATH.join2(
					typeof parent == "string" ? parent : FS.getPath(parent),
					name,
				);
				var mode = FS_getMode(canRead, canWrite);
				return FS.create(path, mode);
			},
			createDataFile(parent, name, data, canRead, canWrite, canOwn) {
				var path = name;
				if (parent) {
					parent = typeof parent == "string" ? parent : FS.getPath(parent);
					path = name ? PATH.join2(parent, name) : parent;
				}
				var mode = FS_getMode(canRead, canWrite);
				var node = FS.create(path, mode);
				if (data) {
					if (typeof data == "string") {
						var arr = new Array(data.length);
						for (var i = 0, len = data.length; i < len; ++i)
							arr[i] = data.charCodeAt(i);
						data = arr;
					}
					// make sure we can write to the file
					FS.chmod(node, mode | 146);
					var stream = FS.open(node, 577);
					FS.write(stream, data, 0, data.length, 0, canOwn);
					FS.close(stream);
					FS.chmod(node, mode);
				}
			},
			createDevice(parent, name, input, output) {
				var path = PATH.join2(
					typeof parent == "string" ? parent : FS.getPath(parent),
					name,
				);
				var mode = FS_getMode(!!input, !!output);
				FS.createDevice.major ??= 64;
				var dev = FS.makedev(FS.createDevice.major++, 0);
				// Create a fake device that a set of stream ops to emulate
				// the old behavior.
				FS.registerDevice(dev, {
					open(stream) {
						stream.seekable = false;
					},
					close(stream) {
						// flush any pending line data
						if (output?.buffer?.length) {
							output(10);
						}
					},
					read(stream, buffer, offset, length, pos /* ignored */) {
						var bytesRead = 0;
						for (var i = 0; i < length; i++) {
							var result;
							try {
								result = input();
							} catch (e) {
								throw new FS.ErrnoError(29);
							}
							if (result === undefined && bytesRead === 0) {
								throw new FS.ErrnoError(6);
							}
							if (result === null || result === undefined) break;
							bytesRead++;
							buffer[offset + i] = result;
						}
						if (bytesRead) {
							stream.node.atime = Date.now();
						}
						return bytesRead;
					},
					write(stream, buffer, offset, length, pos) {
						for (var i = 0; i < length; i++) {
							try {
								output(buffer[offset + i]);
							} catch (e) {
								throw new FS.ErrnoError(29);
							}
						}
						if (length) {
							stream.node.mtime = stream.node.ctime = Date.now();
						}
						return i;
					},
				});
				return FS.mkdev(path, mode, dev);
			},
			forceLoadFile(obj) {
				if (obj.isDevice || obj.isFolder || obj.link || obj.contents)
					return true;
				if (typeof XMLHttpRequest != "undefined") {
					throw new Error(
						"Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.",
					);
				} else {
					// Command-line.
					try {
						obj.contents = readBinary(obj.url);
						obj.usedBytes = obj.contents.length;
					} catch (e) {
						throw new FS.ErrnoError(29);
					}
				}
			},
			createLazyFile(parent, name, url, canRead, canWrite) {
				// Lazy chunked Uint8Array (implements get and length from Uint8Array).
				// Actual getting is abstracted away for eventual reuse.
				class LazyUint8Array {
					lengthKnown = false;
					chunks = []; // Loaded chunks. Index is the chunk number
					get(idx) {
						if (idx > this.length - 1 || idx < 0) {
							return undefined;
						}
						var chunkOffset = idx % this.chunkSize;
						var chunkNum = (idx / this.chunkSize) | 0;
						return this.getter(chunkNum)[chunkOffset];
					}
					setDataGetter(getter) {
						this.getter = getter;
					}
					cacheLength() {
						// Find length
						var xhr = new XMLHttpRequest();
						xhr.open("HEAD", url, false);
						xhr.send(null);
						if (
							!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304)
						)
							throw new Error(
								"Couldn't load " + url + ". Status: " + xhr.status,
							);
						var datalength = Number(xhr.getResponseHeader("Content-length"));
						var header;
						var hasByteServing =
							(header = xhr.getResponseHeader("Accept-Ranges")) &&
							header === "bytes";
						var usesGzip =
							(header = xhr.getResponseHeader("Content-Encoding")) &&
							header === "gzip";

						var chunkSize = 1024 * 1024; // Chunk size in bytes

						if (!hasByteServing) chunkSize = datalength;

						// Function to get a range from the remote URL.
						var doXHR = (from, to) => {
							if (from > to)
								throw new Error(
									"invalid range (" +
										from +
										", " +
										to +
										") or no bytes requested!",
								);
							if (to > datalength - 1)
								throw new Error(
									"only " + datalength + " bytes available! programmer error!",
								);

							// TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
							var xhr = new XMLHttpRequest();
							xhr.open("GET", url, false);
							if (datalength !== chunkSize)
								xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);

							// Some hints to the browser that we want binary data.
							xhr.responseType = "arraybuffer";
							if (xhr.overrideMimeType) {
								xhr.overrideMimeType("text/plain; charset=x-user-defined");
							}

							xhr.send(null);
							if (
								!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304)
							)
								throw new Error(
									"Couldn't load " + url + ". Status: " + xhr.status,
								);
							if (xhr.response !== undefined) {
								return new Uint8Array(
									/** @type{Array<number>} */ (xhr.response || []),
								);
							}
							return intArrayFromString(xhr.responseText || "", true);
						};
						var lazyArray = this;
						lazyArray.setDataGetter((chunkNum) => {
							var start = chunkNum * chunkSize;
							var end = (chunkNum + 1) * chunkSize - 1; // including this byte
							end = Math.min(end, datalength - 1); // if datalength-1 is selected, this is the last block
							if (typeof lazyArray.chunks[chunkNum] == "undefined") {
								lazyArray.chunks[chunkNum] = doXHR(start, end);
							}
							if (typeof lazyArray.chunks[chunkNum] == "undefined")
								throw new Error("doXHR failed!");
							return lazyArray.chunks[chunkNum];
						});

						if (usesGzip || !datalength) {
							// if the server uses gzip or doesn't supply the length, we have to download the whole file to get the (uncompressed) length
							chunkSize = datalength = 1; // this will force getter(0)/doXHR do download the whole file
							datalength = this.getter(0).length;
							chunkSize = datalength;
							out(
								"LazyFiles on gzip forces download of the whole file when length is accessed",
							);
						}

						this._length = datalength;
						this._chunkSize = chunkSize;
						this.lengthKnown = true;
					}
					get length() {
						if (!this.lengthKnown) {
							this.cacheLength();
						}
						return this._length;
					}
					get chunkSize() {
						if (!this.lengthKnown) {
							this.cacheLength();
						}
						return this._chunkSize;
					}
				}

				if (typeof XMLHttpRequest != "undefined") {
					if (!ENVIRONMENT_IS_WORKER)
						throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";
					var lazyArray = new LazyUint8Array();
					var properties = { isDevice: false, contents: lazyArray };
				} else {
					var properties = { isDevice: false, url: url };
				}

				var node = FS.createFile(parent, name, properties, canRead, canWrite);
				// This is a total hack, but I want to get this lazy file code out of the
				// core of MEMFS. If we want to keep this lazy file concept I feel it should
				// be its own thin LAZYFS proxying calls to MEMFS.
				if (properties.contents) {
					node.contents = properties.contents;
				} else if (properties.url) {
					node.contents = null;
					node.url = properties.url;
				}
				// Add a function that defers querying the file size until it is asked the first time.
				Object.defineProperties(node, {
					usedBytes: {
						get: function () {
							return this.contents.length;
						},
					},
				});
				// override each stream op with one that tries to force load the lazy file first
				var stream_ops = {};
				var keys = Object.keys(node.stream_ops);
				keys.forEach((key) => {
					var fn = node.stream_ops[key];
					stream_ops[key] = (...args) => {
						FS.forceLoadFile(node);
						return fn(...args);
					};
				});
				function writeChunks(stream, buffer, offset, length, position) {
					var contents = stream.node.contents;
					if (position >= contents.length) return 0;
					var size = Math.min(contents.length - position, length);
					assert(size >= 0);
					if (contents.slice) {
						// normal array
						for (var i = 0; i < size; i++) {
							buffer[offset + i] = contents[position + i];
						}
					} else {
						for (var i = 0; i < size; i++) {
							// LazyUint8Array from sync binary XHR
							buffer[offset + i] = contents.get(position + i);
						}
					}
					return size;
				}
				// use a custom read function
				stream_ops.read = (stream, buffer, offset, length, position) => {
					FS.forceLoadFile(node);
					return writeChunks(stream, buffer, offset, length, position);
				};
				// use a custom mmap function
				stream_ops.mmap = (stream, length, position, prot, flags) => {
					FS.forceLoadFile(node);
					var ptr = mmapAlloc(length);
					if (!ptr) {
						throw new FS.ErrnoError(48);
					}
					writeChunks(stream, HEAP8, ptr, length, position);
					return { ptr, allocated: true };
				};
				node.stream_ops = stream_ops;
				return node;
			},
			absolutePath() {
				abort("FS.absolutePath has been removed; use PATH_FS.resolve instead");
			},
			createFolder() {
				abort("FS.createFolder has been removed; use FS.mkdir instead");
			},
			createLink() {
				abort("FS.createLink has been removed; use FS.symlink instead");
			},
			joinPath() {
				abort("FS.joinPath has been removed; use PATH.join instead");
			},
			mmapAlloc() {
				abort(
					"FS.mmapAlloc has been replaced by the top level function mmapAlloc",
				);
			},
			standardizePath() {
				abort(
					"FS.standardizePath has been removed; use PATH.normalize instead",
				);
			},
		};

		var SYSCALLS = {
			DEFAULT_POLLMASK: 5,
			calculateAt(dirfd, path, allowEmpty) {
				if (PATH.isAbs(path)) {
					return path;
				}
				// relative path
				var dir;
				if (dirfd === -100) {
					dir = FS.cwd();
				} else {
					var dirstream = SYSCALLS.getStreamFromFD(dirfd);
					dir = dirstream.path;
				}
				if (path.length == 0) {
					if (!allowEmpty) {
						throw new FS.ErrnoError(44);
					}
					return dir;
				}
				return dir + "/" + path;
			},
			doStat(func, path, buf) {
				var stat = func(path);
				HEAP32[buf >> 2] = stat.dev;
				HEAP32[(buf + 4) >> 2] = stat.mode;
				HEAPU32[(buf + 8) >> 2] = stat.nlink;
				HEAP32[(buf + 12) >> 2] = stat.uid;
				HEAP32[(buf + 16) >> 2] = stat.gid;
				HEAP32[(buf + 20) >> 2] = stat.rdev;
				(tempI64 = [
					stat.size >>> 0,
					((tempDouble = stat.size),
					+Math.abs(tempDouble) >= 1.0
						? tempDouble > 0.0
							? +Math.floor(tempDouble / 4294967296.0) >>> 0
							: ~~+Math.ceil(
									(tempDouble - +(~~tempDouble >>> 0)) / 4294967296.0,
								) >>> 0
						: 0),
				]),
					(HEAP32[(buf + 24) >> 2] = tempI64[0]),
					(HEAP32[(buf + 28) >> 2] = tempI64[1]);
				HEAP32[(buf + 32) >> 2] = 4096;
				HEAP32[(buf + 36) >> 2] = stat.blocks;
				var atime = stat.atime.getTime();
				var mtime = stat.mtime.getTime();
				var ctime = stat.ctime.getTime();
				(tempI64 = [
					Math.floor(atime / 1000) >>> 0,
					((tempDouble = Math.floor(atime / 1000)),
					+Math.abs(tempDouble) >= 1.0
						? tempDouble > 0.0
							? +Math.floor(tempDouble / 4294967296.0) >>> 0
							: ~~+Math.ceil(
									(tempDouble - +(~~tempDouble >>> 0)) / 4294967296.0,
								) >>> 0
						: 0),
				]),
					(HEAP32[(buf + 40) >> 2] = tempI64[0]),
					(HEAP32[(buf + 44) >> 2] = tempI64[1]);
				HEAPU32[(buf + 48) >> 2] = (atime % 1000) * 1000 * 1000;
				(tempI64 = [
					Math.floor(mtime / 1000) >>> 0,
					((tempDouble = Math.floor(mtime / 1000)),
					+Math.abs(tempDouble) >= 1.0
						? tempDouble > 0.0
							? +Math.floor(tempDouble / 4294967296.0) >>> 0
							: ~~+Math.ceil(
									(tempDouble - +(~~tempDouble >>> 0)) / 4294967296.0,
								) >>> 0
						: 0),
				]),
					(HEAP32[(buf + 56) >> 2] = tempI64[0]),
					(HEAP32[(buf + 60) >> 2] = tempI64[1]);
				HEAPU32[(buf + 64) >> 2] = (mtime % 1000) * 1000 * 1000;
				(tempI64 = [
					Math.floor(ctime / 1000) >>> 0,
					((tempDouble = Math.floor(ctime / 1000)),
					+Math.abs(tempDouble) >= 1.0
						? tempDouble > 0.0
							? +Math.floor(tempDouble / 4294967296.0) >>> 0
							: ~~+Math.ceil(
									(tempDouble - +(~~tempDouble >>> 0)) / 4294967296.0,
								) >>> 0
						: 0),
				]),
					(HEAP32[(buf + 72) >> 2] = tempI64[0]),
					(HEAP32[(buf + 76) >> 2] = tempI64[1]);
				HEAPU32[(buf + 80) >> 2] = (ctime % 1000) * 1000 * 1000;
				(tempI64 = [
					stat.ino >>> 0,
					((tempDouble = stat.ino),
					+Math.abs(tempDouble) >= 1.0
						? tempDouble > 0.0
							? +Math.floor(tempDouble / 4294967296.0) >>> 0
							: ~~+Math.ceil(
									(tempDouble - +(~~tempDouble >>> 0)) / 4294967296.0,
								) >>> 0
						: 0),
				]),
					(HEAP32[(buf + 88) >> 2] = tempI64[0]),
					(HEAP32[(buf + 92) >> 2] = tempI64[1]);
				return 0;
			},
			doMsync(addr, stream, len, flags, offset) {
				if (!FS.isFile(stream.node.mode)) {
					throw new FS.ErrnoError(43);
				}
				if (flags & 2) {
					// MAP_PRIVATE calls need not to be synced back to underlying fs
					return 0;
				}
				var buffer = HEAPU8.slice(addr, addr + len);
				FS.msync(stream, buffer, offset, len, flags);
			},
			getStreamFromFD(fd) {
				var stream = FS.getStreamChecked(fd);
				return stream;
			},
			varargs: undefined,
			getStr(ptr) {
				var ret = UTF8ToString(ptr);
				return ret;
			},
		};
		var ___syscall__newselect = function (
			nfds,
			readfds,
			writefds,
			exceptfds,
			timeout,
		) {
			try {
				// readfds are supported,
				// writefds checks socket open status
				// exceptfds are supported, although on web, such exceptional conditions never arise in web sockets
				//                          and so the exceptfds list will always return empty.
				// timeout is supported, although on SOCKFS and PIPEFS these are ignored and always treated as 0 - fully async
				assert(nfds <= 64, "nfds must be less than or equal to 64"); // fd sets have 64 bits // TODO: this could be 1024 based on current musl headers

				var total = 0;

				var srcReadLow = readfds ? HEAP32[readfds >> 2] : 0,
					srcReadHigh = readfds ? HEAP32[(readfds + 4) >> 2] : 0;
				var srcWriteLow = writefds ? HEAP32[writefds >> 2] : 0,
					srcWriteHigh = writefds ? HEAP32[(writefds + 4) >> 2] : 0;
				var srcExceptLow = exceptfds ? HEAP32[exceptfds >> 2] : 0,
					srcExceptHigh = exceptfds ? HEAP32[(exceptfds + 4) >> 2] : 0;

				var dstReadLow = 0,
					dstReadHigh = 0;
				var dstWriteLow = 0,
					dstWriteHigh = 0;
				var dstExceptLow = 0,
					dstExceptHigh = 0;

				var allLow =
					(readfds ? HEAP32[readfds >> 2] : 0) |
					(writefds ? HEAP32[writefds >> 2] : 0) |
					(exceptfds ? HEAP32[exceptfds >> 2] : 0);
				var allHigh =
					(readfds ? HEAP32[(readfds + 4) >> 2] : 0) |
					(writefds ? HEAP32[(writefds + 4) >> 2] : 0) |
					(exceptfds ? HEAP32[(exceptfds + 4) >> 2] : 0);

				var check = (fd, low, high, val) => (fd < 32 ? low & val : high & val);

				for (var fd = 0; fd < nfds; fd++) {
					var mask = 1 << (fd % 32);
					if (!check(fd, allLow, allHigh, mask)) {
						continue; // index isn't in the set
					}

					var stream = SYSCALLS.getStreamFromFD(fd);

					var flags = SYSCALLS.DEFAULT_POLLMASK;

					if (stream.stream_ops.poll) {
						var timeoutInMillis = -1;
						if (timeout) {
							// select(2) is declared to accept "struct timeval { time_t tv_sec; suseconds_t tv_usec; }".
							// However, musl passes the two values to the syscall as an array of long values.
							// Note that sizeof(time_t) != sizeof(long) in wasm32. The former is 8, while the latter is 4.
							// This means using "C_STRUCTS.timeval.tv_usec" leads to a wrong offset.
							// So, instead, we use POINTER_SIZE.
							var tv_sec = readfds ? HEAP32[timeout >> 2] : 0,
								tv_usec = readfds ? HEAP32[(timeout + 4) >> 2] : 0;
							timeoutInMillis = (tv_sec + tv_usec / 1000000) * 1000;
						}
						flags = stream.stream_ops.poll(stream, timeoutInMillis);
					}

					if (flags & 1 && check(fd, srcReadLow, srcReadHigh, mask)) {
						fd < 32
							? (dstReadLow = dstReadLow | mask)
							: (dstReadHigh = dstReadHigh | mask);
						total++;
					}
					if (flags & 4 && check(fd, srcWriteLow, srcWriteHigh, mask)) {
						fd < 32
							? (dstWriteLow = dstWriteLow | mask)
							: (dstWriteHigh = dstWriteHigh | mask);
						total++;
					}
					if (flags & 2 && check(fd, srcExceptLow, srcExceptHigh, mask)) {
						fd < 32
							? (dstExceptLow = dstExceptLow | mask)
							: (dstExceptHigh = dstExceptHigh | mask);
						total++;
					}
				}

				if (readfds) {
					HEAP32[readfds >> 2] = dstReadLow;
					HEAP32[(readfds + 4) >> 2] = dstReadHigh;
				}
				if (writefds) {
					HEAP32[writefds >> 2] = dstWriteLow;
					HEAP32[(writefds + 4) >> 2] = dstWriteHigh;
				}
				if (exceptfds) {
					HEAP32[exceptfds >> 2] = dstExceptLow;
					HEAP32[(exceptfds + 4) >> 2] = dstExceptHigh;
				}

				return total;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		};

		var SOCKFS = {
			websocketArgs: {},
			callbacks: {},
			on(event, callback) {
				SOCKFS.callbacks[event] = callback;
			},
			emit(event, param) {
				SOCKFS.callbacks[event]?.(param);
			},
			mount(mount) {
				// The incomming Module['websocket'] can be used for configuring
				// configuring subprotocol/url, etc
				SOCKFS.websocketArgs = Module["websocket"] || {};
				// Add the Event registration mechanism to the exported websocket configuration
				// object so we can register network callbacks from native JavaScript too.
				// For more documentation see system/include/emscripten/emscripten.h
				(Module["websocket"] ??= {})["on"] = SOCKFS.on;

				return FS.createNode(null, "/", 16895, 0);
			},
			createSocket(family, type, protocol) {
				type &= ~526336; // Some applications may pass it; it makes no sense for a single process.
				var streaming = type == 1;
				if (streaming && protocol && protocol != 6) {
					throw new FS.ErrnoError(66); // if SOCK_STREAM, must be tcp or 0.
				}

				// create our internal socket structure
				var sock = {
					family,
					type,
					protocol,
					server: null,
					error: null, // Used in getsockopt for SOL_SOCKET/SO_ERROR test
					peers: {},
					pending: [],
					recv_queue: [],
					sock_ops: SOCKFS.websocket_sock_ops,
				};

				// create the filesystem node to store the socket structure
				var name = SOCKFS.nextname();
				var node = FS.createNode(SOCKFS.root, name, 49152, 0);
				node.sock = sock;

				// and the wrapping stream that enables library functions such
				// as read and write to indirectly interact with the socket
				var stream = FS.createStream({
					path: name,
					node,
					flags: 2,
					seekable: false,
					stream_ops: SOCKFS.stream_ops,
				});

				// map the new stream to the socket structure (sockets have a 1:1
				// relationship with a stream)
				sock.stream = stream;

				return sock;
			},
			getSocket(fd) {
				var stream = FS.getStream(fd);
				if (!stream || !FS.isSocket(stream.node.mode)) {
					return null;
				}
				return stream.node.sock;
			},
			stream_ops: {
				poll(stream) {
					var sock = stream.node.sock;
					return sock.sock_ops.poll(sock);
				},
				ioctl(stream, request, varargs) {
					var sock = stream.node.sock;
					return sock.sock_ops.ioctl(sock, request, varargs);
				},
				read(stream, buffer, offset, length, position /* ignored */) {
					var sock = stream.node.sock;
					var msg = sock.sock_ops.recvmsg(sock, length);
					if (!msg) {
						// socket is closed
						return 0;
					}
					buffer.set(msg.buffer, offset);
					return msg.buffer.length;
				},
				write(stream, buffer, offset, length, position /* ignored */) {
					var sock = stream.node.sock;
					return sock.sock_ops.sendmsg(sock, buffer, offset, length);
				},
				close(stream) {
					var sock = stream.node.sock;
					sock.sock_ops.close(sock);
				},
			},
			nextname() {
				if (!SOCKFS.nextname.current) {
					SOCKFS.nextname.current = 0;
				}
				return `socket[${SOCKFS.nextname.current++}]`;
			},
			websocket_sock_ops: {
				createPeer(sock, addr, port) {
					var ws;

					if (typeof addr == "object") {
						ws = addr;
						addr = null;
						port = null;
					}

					if (ws) {
						// for sockets that've already connected (e.g. we're the server)
						// we can inspect the _socket property for the address
						if (ws._socket) {
							addr = ws._socket.remoteAddress;
							port = ws._socket.remotePort;
						}
						// if we're just now initializing a connection to the remote,
						// inspect the url property
						else {
							var result = /ws[s]?:\/\/([^:]+):(\d+)/.exec(ws.url);
							if (!result) {
								throw new Error(
									"WebSocket URL must be in the format ws(s)://address:port",
								);
							}
							addr = result[1];
							port = parseInt(result[2], 10);
						}
					} else {
						// create the actual websocket object and connect
						try {
							// The default value is 'ws://' the replace is needed because the compiler replaces '//' comments with '#'
							// comments without checking context, so we'd end up with ws:#, the replace swaps the '#' for '//' again.
							var url = "ws:#".replace("#", "//");
							// Make the WebSocket subprotocol (Sec-WebSocket-Protocol) default to binary if no configuration is set.
							var subProtocols = "binary"; // The default value is 'binary'
							// The default WebSocket options
							var opts = undefined;

							// Fetch runtime WebSocket URL config.
							if (SOCKFS.websocketArgs["url"]) {
								url = SOCKFS.websocketArgs["url"];
							}
							// Fetch runtime WebSocket subprotocol config.
							if (SOCKFS.websocketArgs["subprotocol"]) {
								subProtocols = SOCKFS.websocketArgs["subprotocol"];
							} else if (SOCKFS.websocketArgs["subprotocol"] === null) {
								subProtocols = "null";
							}

							if (url === "ws://" || url === "wss://") {
								// Is the supplied URL config just a prefix, if so complete it.
								var parts = addr.split("/");
								url =
									url + parts[0] + ":" + port + "/" + parts.slice(1).join("/");
							}

							if (subProtocols !== "null") {
								// The regex trims the string (removes spaces at the beginning and end, then splits the string by
								// <any space>,<any space> into an Array. Whitespace removal is important for Websockify and ws.
								subProtocols = subProtocols
									.replace(/^ +| +$/g, "")
									.split(/ *, */);

								opts = subProtocols;
							}

							// If node we use the ws library.
							var WebSocketConstructor;
							{
								WebSocketConstructor = WebSocket;
							}
							ws = new WebSocketConstructor(url, opts);
							ws.binaryType = "arraybuffer";
						} catch (e) {
							throw new FS.ErrnoError(23);
						}
					}

					var peer = {
						addr,
						port,
						socket: ws,
						msg_send_queue: [],
					};

					SOCKFS.websocket_sock_ops.addPeer(sock, peer);
					SOCKFS.websocket_sock_ops.handlePeerEvents(sock, peer);

					// if this is a bound dgram socket, send the port number first to allow
					// us to override the ephemeral port reported to us by remotePort on the
					// remote end.
					if (sock.type === 2 && typeof sock.sport != "undefined") {
						peer.msg_send_queue.push(
							new Uint8Array([
								255,
								255,
								255,
								255,
								"p".charCodeAt(0),
								"o".charCodeAt(0),
								"r".charCodeAt(0),
								"t".charCodeAt(0),
								(sock.sport & 0xff00) >> 8,
								sock.sport & 0xff,
							]),
						);
					}

					return peer;
				},
				getPeer(sock, addr, port) {
					return sock.peers[addr + ":" + port];
				},
				addPeer(sock, peer) {
					sock.peers[peer.addr + ":" + peer.port] = peer;
				},
				removePeer(sock, peer) {
					delete sock.peers[peer.addr + ":" + peer.port];
				},
				handlePeerEvents(sock, peer) {
					var first = true;

					var handleOpen = function () {
						sock.connecting = false;
						SOCKFS.emit("open", sock.stream.fd);

						try {
							var queued = peer.msg_send_queue.shift();
							while (queued) {
								peer.socket.send(queued);
								queued = peer.msg_send_queue.shift();
							}
						} catch (e) {
							// not much we can do here in the way of proper error handling as we've already
							// lied and said this data was sent. shut it down.
							peer.socket.close();
						}
					};

					function handleMessage(data) {
						if (typeof data == "string") {
							var encoder = new TextEncoder(); // should be utf-8
							data = encoder.encode(data); // make a typed array from the string
						} else {
							assert(data.byteLength !== undefined); // must receive an ArrayBuffer
							if (data.byteLength == 0) {
								// An empty ArrayBuffer will emit a pseudo disconnect event
								// as recv/recvmsg will return zero which indicates that a socket
								// has performed a shutdown although the connection has not been disconnected yet.
								return;
							}
							data = new Uint8Array(data); // make a typed array view on the array buffer
						}

						// if this is the port message, override the peer's port with it
						var wasfirst = first;
						first = false;
						if (
							wasfirst &&
							data.length === 10 &&
							data[0] === 255 &&
							data[1] === 255 &&
							data[2] === 255 &&
							data[3] === 255 &&
							data[4] === "p".charCodeAt(0) &&
							data[5] === "o".charCodeAt(0) &&
							data[6] === "r".charCodeAt(0) &&
							data[7] === "t".charCodeAt(0)
						) {
							// update the peer's port and it's key in the peer map
							var newport = (data[8] << 8) | data[9];
							SOCKFS.websocket_sock_ops.removePeer(sock, peer);
							peer.port = newport;
							SOCKFS.websocket_sock_ops.addPeer(sock, peer);
							return;
						}

						sock.recv_queue.push({
							addr: peer.addr,
							port: peer.port,
							data: data,
						});
						SOCKFS.emit("message", sock.stream.fd);
					}

					if (ENVIRONMENT_IS_NODE) {
						peer.socket.on("open", handleOpen);
						peer.socket.on("message", function (data, isBinary) {
							if (!isBinary) {
								return;
							}
							handleMessage(new Uint8Array(data).buffer); // copy from node Buffer -> ArrayBuffer
						});
						peer.socket.on("close", function () {
							SOCKFS.emit("close", sock.stream.fd);
						});
						peer.socket.on("error", function (error) {
							// Although the ws library may pass errors that may be more descriptive than
							// ECONNREFUSED they are not necessarily the expected error code e.g.
							// ENOTFOUND on getaddrinfo seems to be node.js specific, so using ECONNREFUSED
							// is still probably the most useful thing to do.
							sock.error = 14; // Used in getsockopt for SOL_SOCKET/SO_ERROR test.
							SOCKFS.emit("error", [
								sock.stream.fd,
								sock.error,
								"ECONNREFUSED: Connection refused",
							]);
							// don't throw
						});
					} else {
						peer.socket.onopen = handleOpen;
						peer.socket.onclose = function () {
							SOCKFS.emit("close", sock.stream.fd);
						};
						peer.socket.onmessage = function peer_socket_onmessage(event) {
							handleMessage(event.data);
						};
						peer.socket.onerror = function (error) {
							// The WebSocket spec only allows a 'simple event' to be thrown on error,
							// so we only really know as much as ECONNREFUSED.
							sock.error = 14; // Used in getsockopt for SOL_SOCKET/SO_ERROR test.
							SOCKFS.emit("error", [
								sock.stream.fd,
								sock.error,
								"ECONNREFUSED: Connection refused",
							]);
						};
					}
				},
				poll(sock) {
					if (sock.type === 1 && sock.server) {
						// listen sockets should only say they're available for reading
						// if there are pending clients.
						return sock.pending.length ? 64 | 1 : 0;
					}

					var mask = 0;
					var dest =
						sock.type === 1
							? // we only care about the socket state for connection-based sockets
								SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport)
							: null;

					if (
						sock.recv_queue.length ||
						!dest || // connection-less sockets are always ready to read
						(dest && dest.socket.readyState === dest.socket.CLOSING) ||
						(dest && dest.socket.readyState === dest.socket.CLOSED)
					) {
						// let recv return 0 once closed
						mask |= 64 | 1;
					}

					if (
						!dest || // connection-less sockets are always ready to write
						(dest && dest.socket.readyState === dest.socket.OPEN)
					) {
						mask |= 4;
					}

					if (
						(dest && dest.socket.readyState === dest.socket.CLOSING) ||
						(dest && dest.socket.readyState === dest.socket.CLOSED)
					) {
						// When an non-blocking connect fails mark the socket as writable.
						// Its up to the calling code to then use getsockopt with SO_ERROR to
						// retrieve the error.
						// See https://man7.org/linux/man-pages/man2/connect.2.html
						if (sock.connecting) {
							mask |= 4;
						} else {
							mask |= 16;
						}
					}

					return mask;
				},
				ioctl(sock, request, arg) {
					switch (request) {
						case 21531:
							var bytes = 0;
							if (sock.recv_queue.length) {
								bytes = sock.recv_queue[0].data.length;
							}
							HEAP32[arg >> 2] = bytes;
							return 0;
						default:
							return 28;
					}
				},
				close(sock) {
					// if we've spawned a listen server, close it
					if (sock.server) {
						try {
							sock.server.close();
						} catch (e) {}
						sock.server = null;
					}
					// close any peer connections
					var peers = Object.keys(sock.peers);
					for (var i = 0; i < peers.length; i++) {
						var peer = sock.peers[peers[i]];
						try {
							peer.socket.close();
						} catch (e) {}
						SOCKFS.websocket_sock_ops.removePeer(sock, peer);
					}
					return 0;
				},
				bind(sock, addr, port) {
					if (
						typeof sock.saddr != "undefined" ||
						typeof sock.sport != "undefined"
					) {
						throw new FS.ErrnoError(28); // already bound
					}
					sock.saddr = addr;
					sock.sport = port;
					// in order to emulate dgram sockets, we need to launch a listen server when
					// binding on a connection-less socket
					// note: this is only required on the server side
					if (sock.type === 2) {
						// close the existing server if it exists
						if (sock.server) {
							sock.server.close();
							sock.server = null;
						}
						// swallow error operation not supported error that occurs when binding in the
						// browser where this isn't supported
						try {
							sock.sock_ops.listen(sock, 0);
						} catch (e) {
							if (!(e.name === "ErrnoError")) throw e;
							if (e.errno !== 138) throw e;
						}
					}
				},
				connect(sock, addr, port) {
					if (sock.server) {
						throw new FS.ErrnoError(138);
					}

					// TODO autobind
					// if (!sock.addr && sock.type == 2) {
					// }

					// early out if we're already connected / in the middle of connecting
					if (
						typeof sock.daddr != "undefined" &&
						typeof sock.dport != "undefined"
					) {
						var dest = SOCKFS.websocket_sock_ops.getPeer(
							sock,
							sock.daddr,
							sock.dport,
						);
						if (dest) {
							if (dest.socket.readyState === dest.socket.CONNECTING) {
								throw new FS.ErrnoError(7);
							} else {
								throw new FS.ErrnoError(30);
							}
						}
					}

					// add the socket to our peer list and set our
					// destination address / port to match
					var peer = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port);
					sock.daddr = peer.addr;
					sock.dport = peer.port;

					// because we cannot synchronously block to wait for the WebSocket
					// connection to complete, we return here pretending that the connection
					// was a success.
					sock.connecting = true;
				},
				listen(sock, backlog) {
					if (!ENVIRONMENT_IS_NODE) {
						throw new FS.ErrnoError(138);
					}
				},
				accept(listensock) {
					if (!listensock.server || !listensock.pending.length) {
						throw new FS.ErrnoError(28);
					}
					var newsock = listensock.pending.shift();
					newsock.stream.flags = listensock.stream.flags;
					return newsock;
				},
				getname(sock, peer) {
					var addr, port;
					if (peer) {
						if (sock.daddr === undefined || sock.dport === undefined) {
							throw new FS.ErrnoError(53);
						}
						addr = sock.daddr;
						port = sock.dport;
					} else {
						// TODO saddr and sport will be set for bind()'d UDP sockets, but what
						// should we be returning for TCP sockets that've been connect()'d?
						addr = sock.saddr || 0;
						port = sock.sport || 0;
					}
					return { addr, port };
				},
				sendmsg(sock, buffer, offset, length, addr, port) {
					if (sock.type === 2) {
						// connection-less sockets will honor the message address,
						// and otherwise fall back to the bound destination address
						if (addr === undefined || port === undefined) {
							addr = sock.daddr;
							port = sock.dport;
						}
						// if there was no address to fall back to, error out
						if (addr === undefined || port === undefined) {
							throw new FS.ErrnoError(17);
						}
					} else {
						// connection-based sockets will only use the bound
						addr = sock.daddr;
						port = sock.dport;
					}

					// find the peer for the destination address
					var dest = SOCKFS.websocket_sock_ops.getPeer(sock, addr, port);

					// early out if not connected with a connection-based socket
					if (sock.type === 1) {
						if (
							!dest ||
							dest.socket.readyState === dest.socket.CLOSING ||
							dest.socket.readyState === dest.socket.CLOSED
						) {
							throw new FS.ErrnoError(53);
						}
					}

					// create a copy of the incoming data to send, as the WebSocket API
					// doesn't work entirely with an ArrayBufferView, it'll just send
					// the entire underlying buffer
					if (ArrayBuffer.isView(buffer)) {
						offset += buffer.byteOffset;
						buffer = buffer.buffer;
					}

					var data = buffer.slice(offset, offset + length);

					// if we don't have a cached connectionless UDP datagram connection, or
					// the TCP socket is still connecting, queue the message to be sent upon
					// connect, and lie, saying the data was sent now.
					if (!dest || dest.socket.readyState !== dest.socket.OPEN) {
						// if we're not connected, open a new connection
						if (sock.type === 2) {
							if (
								!dest ||
								dest.socket.readyState === dest.socket.CLOSING ||
								dest.socket.readyState === dest.socket.CLOSED
							) {
								dest = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port);
							}
						}
						dest.msg_send_queue.push(data);
						return length;
					}

					try {
						// send the actual data
						dest.socket.send(data);
						return length;
					} catch (e) {
						throw new FS.ErrnoError(28);
					}
				},
				recvmsg(sock, length) {
					// http://pubs.opengroup.org/onlinepubs/7908799/xns/recvmsg.html
					if (sock.type === 1 && sock.server) {
						// tcp servers should not be recv()'ing on the listen socket
						throw new FS.ErrnoError(53);
					}

					var queued = sock.recv_queue.shift();
					if (!queued) {
						if (sock.type === 1) {
							var dest = SOCKFS.websocket_sock_ops.getPeer(
								sock,
								sock.daddr,
								sock.dport,
							);

							if (!dest) {
								// if we have a destination address but are not connected, error out
								throw new FS.ErrnoError(53);
							}
							if (
								dest.socket.readyState === dest.socket.CLOSING ||
								dest.socket.readyState === dest.socket.CLOSED
							) {
								// return null if the socket has closed
								return null;
							}
							// else, our socket is in a valid state but truly has nothing available
							throw new FS.ErrnoError(6);
						}
						throw new FS.ErrnoError(6);
					}

					// queued.data will be an ArrayBuffer if it's unadulterated, but if it's
					// requeued TCP data it'll be an ArrayBufferView
					var queuedLength = queued.data.byteLength || queued.data.length;
					var queuedOffset = queued.data.byteOffset || 0;
					var queuedBuffer = queued.data.buffer || queued.data;
					var bytesRead = Math.min(length, queuedLength);
					var res = {
						buffer: new Uint8Array(queuedBuffer, queuedOffset, bytesRead),
						addr: queued.addr,
						port: queued.port,
					};

					// push back any unread data for TCP connections
					if (sock.type === 1 && bytesRead < queuedLength) {
						var bytesRemaining = queuedLength - bytesRead;
						queued.data = new Uint8Array(
							queuedBuffer,
							queuedOffset + bytesRead,
							bytesRemaining,
						);
						sock.recv_queue.unshift(queued);
					}

					return res;
				},
			},
		};

		var getSocketFromFD = (fd) => {
			var socket = SOCKFS.getSocket(fd);
			if (!socket) throw new FS.ErrnoError(8);
			return socket;
		};

		var Sockets = {
			BUFFER_SIZE: 10240,
			MAX_BUFFER_SIZE: 10485760,
			nextFd: 1,
			fds: {},
			nextport: 1,
			maxport: 65535,
			peer: null,
			connections: {},
			portmap: {},
			localAddr: 4261412874,
			addrPool: [
				33554442, 50331658, 67108874, 83886090, 100663306, 117440522, 134217738,
				150994954, 167772170, 184549386, 201326602, 218103818, 234881034,
			],
		};

		var inetPton4 = (str) => {
			var b = str.split(".");
			for (var i = 0; i < 4; i++) {
				var tmp = Number(b[i]);
				if (isNaN(tmp)) return null;
				b[i] = tmp;
			}
			return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
		};

		/** @suppress {checkTypes} */
		var jstoi_q = (str) => parseInt(str);
		var inetPton6 = (str) => {
			var words;
			var w, offset, z, i;
			/* http://home.deds.nl/~aeron/regex/ */
			var valid6regx =
				/^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!\3)::|:\b|$))|(?!\2\3)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/i;
			var parts = [];
			if (!valid6regx.test(str)) {
				return null;
			}
			if (str === "::") {
				return [0, 0, 0, 0, 0, 0, 0, 0];
			}
			// Z placeholder to keep track of zeros when splitting the string on ":"
			if (str.startsWith("::")) {
				str = str.replace("::", "Z:"); // leading zeros case
			} else {
				str = str.replace("::", ":Z:");
			}

			if (str.indexOf(".") > 0) {
				// parse IPv4 embedded stress
				str = str.replace(new RegExp("[.]", "g"), ":");
				words = str.split(":");
				words[words.length - 4] =
					jstoi_q(words[words.length - 4]) +
					jstoi_q(words[words.length - 3]) * 256;
				words[words.length - 3] =
					jstoi_q(words[words.length - 2]) +
					jstoi_q(words[words.length - 1]) * 256;
				words = words.slice(0, words.length - 2);
			} else {
				words = str.split(":");
			}

			offset = 0;
			z = 0;
			for (w = 0; w < words.length; w++) {
				if (typeof words[w] == "string") {
					if (words[w] === "Z") {
						// compressed zeros - write appropriate number of zero words
						for (z = 0; z < 8 - words.length + 1; z++) {
							parts[w + z] = 0;
						}
						offset = z - 1;
					} else {
						// parse hex to field to 16-bit value and write it in network byte-order
						parts[w + offset] = _htons(parseInt(words[w], 16));
					}
				} else {
					// parsed IPv4 words
					parts[w + offset] = words[w];
				}
			}
			return [
				(parts[1] << 16) | parts[0],
				(parts[3] << 16) | parts[2],
				(parts[5] << 16) | parts[4],
				(parts[7] << 16) | parts[6],
			];
		};

		/** @param {number=} addrlen */
		var writeSockaddr = (sa, family, addr, port, addrlen) => {
			switch (family) {
				case 2:
					addr = inetPton4(addr);
					zeroMemory(sa, 16);
					if (addrlen) {
						HEAP32[addrlen >> 2] = 16;
					}
					HEAP16[sa >> 1] = family;
					HEAP32[(sa + 4) >> 2] = addr;
					HEAP16[(sa + 2) >> 1] = _htons(port);
					break;
				case 10:
					addr = inetPton6(addr);
					zeroMemory(sa, 28);
					if (addrlen) {
						HEAP32[addrlen >> 2] = 28;
					}
					HEAP32[sa >> 2] = family;
					HEAP32[(sa + 8) >> 2] = addr[0];
					HEAP32[(sa + 12) >> 2] = addr[1];
					HEAP32[(sa + 16) >> 2] = addr[2];
					HEAP32[(sa + 20) >> 2] = addr[3];
					HEAP16[(sa + 2) >> 1] = _htons(port);
					break;
				default:
					return 5;
			}
			return 0;
		};

		var DNS = {
			address_map: {
				id: 1,
				addrs: {},
				names: {},
			},
			lookup_name(name) {
				// If the name is already a valid ipv4 / ipv6 address, don't generate a fake one.
				var res = inetPton4(name);
				if (res !== null) {
					return name;
				}
				res = inetPton6(name);
				if (res !== null) {
					return name;
				}

				// See if this name is already mapped.
				var addr;

				if (DNS.address_map.addrs[name]) {
					addr = DNS.address_map.addrs[name];
				} else {
					var id = DNS.address_map.id++;
					assert(id < 65535, "exceeded max address mappings of 65535");

					addr = "172.29." + (id & 0xff) + "." + (id & 0xff00);

					DNS.address_map.names[addr] = name;
					DNS.address_map.addrs[name] = addr;
				}

				return addr;
			},
			lookup_addr(addr) {
				if (DNS.address_map.names[addr]) {
					return DNS.address_map.names[addr];
				}

				return null;
			},
		};
		function ___syscall_accept4(fd, addr, addrlen, flags, d1, d2) {
			try {
				var sock = getSocketFromFD(fd);
				var newsock = sock.sock_ops.accept(sock);
				if (addr) {
					var errno = writeSockaddr(
						addr,
						newsock.family,
						DNS.lookup_name(newsock.daddr),
						newsock.dport,
						addrlen,
					);
					assert(!errno);
				}
				return newsock.stream.fd;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		var inetNtop4 = (addr) =>
			(addr & 0xff) +
			"." +
			((addr >> 8) & 0xff) +
			"." +
			((addr >> 16) & 0xff) +
			"." +
			((addr >> 24) & 0xff);

		var inetNtop6 = (ints) => {
			//  ref:  http://www.ietf.org/rfc/rfc2373.txt - section 2.5.4
			//  Format for IPv4 compatible and mapped  128-bit IPv6 Addresses
			//  128-bits are split into eight 16-bit words
			//  stored in network byte order (big-endian)
			//  |                80 bits               | 16 |      32 bits        |
			//  +-----------------------------------------------------------------+
			//  |               10 bytes               |  2 |      4 bytes        |
			//  +--------------------------------------+--------------------------+
			//  +               5 words                |  1 |      2 words        |
			//  +--------------------------------------+--------------------------+
			//  |0000..............................0000|0000|    IPv4 ADDRESS     | (compatible)
			//  +--------------------------------------+----+---------------------+
			//  |0000..............................0000|FFFF|    IPv4 ADDRESS     | (mapped)
			//  +--------------------------------------+----+---------------------+
			var str = "";
			var word = 0;
			var longest = 0;
			var lastzero = 0;
			var zstart = 0;
			var len = 0;
			var i = 0;
			var parts = [
				ints[0] & 0xffff,
				ints[0] >> 16,
				ints[1] & 0xffff,
				ints[1] >> 16,
				ints[2] & 0xffff,
				ints[2] >> 16,
				ints[3] & 0xffff,
				ints[3] >> 16,
			];

			// Handle IPv4-compatible, IPv4-mapped, loopback and any/unspecified addresses

			var hasipv4 = true;
			var v4part = "";
			// check if the 10 high-order bytes are all zeros (first 5 words)
			for (i = 0; i < 5; i++) {
				if (parts[i] !== 0) {
					hasipv4 = false;
					break;
				}
			}

			if (hasipv4) {
				// low-order 32-bits store an IPv4 address (bytes 13 to 16) (last 2 words)
				v4part = inetNtop4(parts[6] | (parts[7] << 16));
				// IPv4-mapped IPv6 address if 16-bit value (bytes 11 and 12) == 0xFFFF (6th word)
				if (parts[5] === -1) {
					str = "::ffff:";
					str += v4part;
					return str;
				}
				// IPv4-compatible IPv6 address if 16-bit value (bytes 11 and 12) == 0x0000 (6th word)
				if (parts[5] === 0) {
					str = "::";
					//special case IPv6 addresses
					if (v4part === "0.0.0.0") v4part = ""; // any/unspecified address
					if (v4part === "0.0.0.1") v4part = "1"; // loopback address
					str += v4part;
					return str;
				}
			}

			// Handle all other IPv6 addresses

			// first run to find the longest contiguous zero words
			for (word = 0; word < 8; word++) {
				if (parts[word] === 0) {
					if (word - lastzero > 1) {
						len = 0;
					}
					lastzero = word;
					len++;
				}
				if (len > longest) {
					longest = len;
					zstart = word - longest + 1;
				}
			}

			for (word = 0; word < 8; word++) {
				if (longest > 1) {
					// compress contiguous zeros - to produce "::"
					if (parts[word] === 0 && word >= zstart && word < zstart + longest) {
						if (word === zstart) {
							str += ":";
							if (zstart === 0) str += ":"; //leading zeros case
						}
						continue;
					}
				}
				// converts 16-bit words from big-endian to little-endian before converting to hex string
				str += Number(_ntohs(parts[word] & 0xffff)).toString(16);
				str += word < 7 ? ":" : "";
			}
			return str;
		};

		var readSockaddr = (sa, salen) => {
			// family / port offsets are common to both sockaddr_in and sockaddr_in6
			var family = HEAP16[sa >> 1];
			var port = _ntohs(HEAPU16[(sa + 2) >> 1]);
			var addr;

			switch (family) {
				case 2:
					if (salen !== 16) {
						return { errno: 28 };
					}
					addr = HEAP32[(sa + 4) >> 2];
					addr = inetNtop4(addr);
					break;
				case 10:
					if (salen !== 28) {
						return { errno: 28 };
					}
					addr = [
						HEAP32[(sa + 8) >> 2],
						HEAP32[(sa + 12) >> 2],
						HEAP32[(sa + 16) >> 2],
						HEAP32[(sa + 20) >> 2],
					];
					addr = inetNtop6(addr);
					break;
				default:
					return { errno: 5 };
			}

			return { family: family, addr: addr, port: port };
		};

		var getSocketAddress = (addrp, addrlen) => {
			var info = readSockaddr(addrp, addrlen);
			if (info.errno) throw new FS.ErrnoError(info.errno);
			info.addr = DNS.lookup_addr(info.addr) || info.addr;
			return info;
		};
		function ___syscall_bind(fd, addr, addrlen, d1, d2, d3) {
			try {
				var sock = getSocketFromFD(fd);
				var info = getSocketAddress(addr, addrlen);
				sock.sock_ops.bind(sock, info.addr, info.port);
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_chdir(path) {
			try {
				path = SYSCALLS.getStr(path);
				FS.chdir(path);
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_chmod(path, mode) {
			try {
				path = SYSCALLS.getStr(path);
				FS.chmod(path, mode);
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_connect(fd, addr, addrlen, d1, d2, d3) {
			try {
				var sock = getSocketFromFD(fd);
				var info = getSocketAddress(addr, addrlen);
				sock.sock_ops.connect(sock, info.addr, info.port);
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_dup(fd) {
			try {
				var old = SYSCALLS.getStreamFromFD(fd);
				return FS.dupStream(old).fd;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_faccessat(dirfd, path, amode, flags) {
			try {
				path = SYSCALLS.getStr(path);
				assert(flags === 0 || flags == 512);
				path = SYSCALLS.calculateAt(dirfd, path);
				if (amode & ~7) {
					// need a valid mode
					return -28;
				}
				var lookup = FS.lookupPath(path, { follow: true });
				var node = lookup.node;
				if (!node) {
					return -44;
				}
				var perms = "";
				if (amode & 4) perms += "r";
				if (amode & 2) perms += "w";
				if (amode & 1) perms += "x";
				if (
					perms /* otherwise, they've just passed F_OK */ &&
					FS.nodePermissions(node, perms)
				) {
					return -2;
				}
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_fchownat(dirfd, path, owner, group, flags) {
			try {
				path = SYSCALLS.getStr(path);
				var nofollow = flags & 256;
				flags = flags & ~256;
				assert(flags === 0);
				path = SYSCALLS.calculateAt(dirfd, path);
				(nofollow ? FS.lchown : FS.chown)(path, owner, group);
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		/** @suppress {duplicate } */
		var syscallGetVarargI = () => {
			assert(SYSCALLS.varargs != undefined);
			// the `+` prepended here is necessary to convince the JSCompiler that varargs is indeed a number.
			var ret = HEAP32[+SYSCALLS.varargs >> 2];
			SYSCALLS.varargs += 4;
			return ret;
		};
		var syscallGetVarargP = syscallGetVarargI;

		function ___syscall_fcntl64(fd, cmd, varargs) {
			SYSCALLS.varargs = varargs;
			try {
				var stream = SYSCALLS.getStreamFromFD(fd);
				switch (cmd) {
					case 0: {
						var arg = syscallGetVarargI();
						if (arg < 0) {
							return -28;
						}
						while (FS.streams[arg]) {
							arg++;
						}
						var newStream;
						newStream = FS.dupStream(stream, arg);
						return newStream.fd;
					}
					case 1:
					case 2:
						return 0; // FD_CLOEXEC makes no sense for a single process.
					case 3:
						return stream.flags;
					case 4: {
						var arg = syscallGetVarargI();
						stream.flags |= arg;
						return 0;
					}
					case 12: {
						var arg = syscallGetVarargP();
						var offset = 0;
						// We're always unlocked.
						HEAP16[(arg + offset) >> 1] = 2;
						return 0;
					}
					case 13:
					case 14:
						return 0; // Pretend that the locking is successful.
				}
				return -28;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_fdatasync(fd) {
			try {
				var stream = SYSCALLS.getStreamFromFD(fd);
				return 0; // we can't do anything synchronously; the in-memory FS is already synced to
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_fstat64(fd, buf) {
			try {
				var stream = SYSCALLS.getStreamFromFD(fd);
				return SYSCALLS.doStat(FS.stat, stream.path, buf);
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		var convertI32PairToI53Checked = (lo, hi) => {
			assert(lo == lo >>> 0 || lo == (lo | 0)); // lo should either be a i32 or a u32
			assert(hi === (hi | 0)); // hi should be a i32
			return (hi + 0x200000) >>> 0 < 0x400001 - !!lo
				? (lo >>> 0) + hi * 4294967296
				: NaN;
		};
		function ___syscall_ftruncate64(fd, length_low, length_high) {
			var length = convertI32PairToI53Checked(length_low, length_high);

			try {
				if (isNaN(length)) return 61;
				FS.ftruncate(fd, length);
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		var stringToUTF8 = (str, outPtr, maxBytesToWrite) => {
			assert(
				typeof maxBytesToWrite == "number",
				"stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!",
			);
			return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
		};
		function ___syscall_getcwd(buf, size) {
			try {
				if (size === 0) return -28;
				var cwd = FS.cwd();
				var cwdLengthInBytes = lengthBytesUTF8(cwd) + 1;
				if (size < cwdLengthInBytes) return -68;
				stringToUTF8(cwd, buf, size);
				return cwdLengthInBytes;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_getdents64(fd, dirp, count) {
			try {
				var stream = SYSCALLS.getStreamFromFD(fd);
				stream.getdents ||= FS.readdir(stream.path);

				var struct_size = 280;
				var pos = 0;
				var off = FS.llseek(stream, 0, 1);

				var startIdx = Math.floor(off / struct_size);
				var endIdx = Math.min(
					stream.getdents.length,
					startIdx + Math.floor(count / struct_size),
				);
				for (var idx = startIdx; idx < endIdx; idx++) {
					var id;
					var type;
					var name = stream.getdents[idx];
					if (name === ".") {
						id = stream.node.id;
						type = 4; // DT_DIR
					} else if (name === "..") {
						var lookup = FS.lookupPath(stream.path, { parent: true });
						id = lookup.node.id;
						type = 4; // DT_DIR
					} else {
						var child;
						try {
							child = FS.lookupNode(stream.node, name);
						} catch (e) {
							// If the entry is not a directory, file, or symlink, nodefs
							// lookupNode will raise EINVAL. Skip these and continue.
							if (e?.errno === 28) {
								continue;
							}
							throw e;
						}
						id = child.id;
						type = FS.isChrdev(child.mode)
							? 2
							: // DT_CHR, character device.
								FS.isDir(child.mode)
								? 4
								: // DT_DIR, directory.
									FS.isLink(child.mode)
									? 10
									: // DT_LNK, symbolic link.
										8; // DT_REG, regular file.
					}
					assert(id);
					(tempI64 = [
						id >>> 0,
						((tempDouble = id),
						+Math.abs(tempDouble) >= 1.0
							? tempDouble > 0.0
								? +Math.floor(tempDouble / 4294967296.0) >>> 0
								: ~~+Math.ceil(
										(tempDouble - +(~~tempDouble >>> 0)) / 4294967296.0,
									) >>> 0
							: 0),
					]),
						(HEAP32[(dirp + pos) >> 2] = tempI64[0]),
						(HEAP32[(dirp + pos + 4) >> 2] = tempI64[1]);
					(tempI64 = [
						((idx + 1) * struct_size) >>> 0,
						((tempDouble = (idx + 1) * struct_size),
						+Math.abs(tempDouble) >= 1.0
							? tempDouble > 0.0
								? +Math.floor(tempDouble / 4294967296.0) >>> 0
								: ~~+Math.ceil(
										(tempDouble - +(~~tempDouble >>> 0)) / 4294967296.0,
									) >>> 0
							: 0),
					]),
						(HEAP32[(dirp + pos + 8) >> 2] = tempI64[0]),
						(HEAP32[(dirp + pos + 12) >> 2] = tempI64[1]);
					HEAP16[(dirp + pos + 16) >> 1] = 280;
					HEAP8[dirp + pos + 18] = type;
					stringToUTF8(name, dirp + pos + 19, 256);
					pos += struct_size;
				}
				FS.llseek(stream, idx * struct_size, 0);
				return pos;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_getpeername(fd, addr, addrlen, d1, d2, d3) {
			try {
				var sock = getSocketFromFD(fd);
				if (!sock.daddr) {
					return -53; // The socket is not connected.
				}
				var errno = writeSockaddr(
					addr,
					sock.family,
					DNS.lookup_name(sock.daddr),
					sock.dport,
					addrlen,
				);
				assert(!errno);
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_getsockname(fd, addr, addrlen, d1, d2, d3) {
			try {
				var sock = getSocketFromFD(fd);
				// TODO: sock.saddr should never be undefined, see TODO in websocket_sock_ops.getname
				var errno = writeSockaddr(
					addr,
					sock.family,
					DNS.lookup_name(sock.saddr || "0.0.0.0"),
					sock.sport,
					addrlen,
				);
				assert(!errno);
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_getsockopt(fd, level, optname, optval, optlen, d1) {
			try {
				var sock = getSocketFromFD(fd);
				// Minimal getsockopt aimed at resolving https://github.com/emscripten-core/emscripten/issues/2211
				// so only supports SOL_SOCKET with SO_ERROR.
				if (level === 1) {
					if (optname === 4) {
						HEAP32[optval >> 2] = sock.error;
						HEAP32[optlen >> 2] = 4;
						sock.error = null; // Clear the error (The SO_ERROR option obtains and then clears this field).
						return 0;
					}
				}
				return -50; // The option is unknown at the level indicated.
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_ioctl(fd, op, varargs) {
			SYSCALLS.varargs = varargs;
			try {
				var stream = SYSCALLS.getStreamFromFD(fd);
				switch (op) {
					case 21509: {
						if (!stream.tty) return -59;
						return 0;
					}
					case 21505: {
						if (!stream.tty) return -59;
						if (stream.tty.ops.ioctl_tcgets) {
							var termios = stream.tty.ops.ioctl_tcgets(stream);
							var argp = syscallGetVarargP();
							HEAP32[argp >> 2] = termios.c_iflag || 0;
							HEAP32[(argp + 4) >> 2] = termios.c_oflag || 0;
							HEAP32[(argp + 8) >> 2] = termios.c_cflag || 0;
							HEAP32[(argp + 12) >> 2] = termios.c_lflag || 0;
							for (var i = 0; i < 32; i++) {
								HEAP8[argp + i + 17] = termios.c_cc[i] || 0;
							}
							return 0;
						}
						return 0;
					}
					case 21510:
					case 21511:
					case 21512: {
						if (!stream.tty) return -59;
						return 0; // no-op, not actually adjusting terminal settings
					}
					case 21506:
					case 21507:
					case 21508: {
						if (!stream.tty) return -59;
						if (stream.tty.ops.ioctl_tcsets) {
							var argp = syscallGetVarargP();
							var c_iflag = HEAP32[argp >> 2];
							var c_oflag = HEAP32[(argp + 4) >> 2];
							var c_cflag = HEAP32[(argp + 8) >> 2];
							var c_lflag = HEAP32[(argp + 12) >> 2];
							var c_cc = [];
							for (var i = 0; i < 32; i++) {
								c_cc.push(HEAP8[argp + i + 17]);
							}
							return stream.tty.ops.ioctl_tcsets(stream.tty, op, {
								c_iflag,
								c_oflag,
								c_cflag,
								c_lflag,
								c_cc,
							});
						}
						return 0; // no-op, not actually adjusting terminal settings
					}
					case 21519: {
						if (!stream.tty) return -59;
						var argp = syscallGetVarargP();
						HEAP32[argp >> 2] = 0;
						return 0;
					}
					case 21520: {
						if (!stream.tty) return -59;
						return -28; // not supported
					}
					case 21531: {
						var argp = syscallGetVarargP();
						return FS.ioctl(stream, op, argp);
					}
					case 21523: {
						// TODO: in theory we should write to the winsize struct that gets
						// passed in, but for now musl doesn't read anything on it
						if (!stream.tty) return -59;
						if (stream.tty.ops.ioctl_tiocgwinsz) {
							var winsize = stream.tty.ops.ioctl_tiocgwinsz(stream.tty);
							var argp = syscallGetVarargP();
							HEAP16[argp >> 1] = winsize[0];
							HEAP16[(argp + 2) >> 1] = winsize[1];
						}
						return 0;
					}
					case 21524: {
						// TODO: technically, this ioctl call should change the window size.
						// but, since emscripten doesn't have any concept of a terminal window
						// yet, we'll just silently throw it away as we do TIOCGWINSZ
						if (!stream.tty) return -59;
						return 0;
					}
					case 21515: {
						if (!stream.tty) return -59;
						return 0;
					}
					default:
						return -28; // not supported
				}
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_listen(fd, backlog) {
			try {
				var sock = getSocketFromFD(fd);
				sock.sock_ops.listen(sock, backlog);
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_lstat64(path, buf) {
			try {
				path = SYSCALLS.getStr(path);
				return SYSCALLS.doStat(FS.lstat, path, buf);
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_mkdirat(dirfd, path, mode) {
			try {
				path = SYSCALLS.getStr(path);
				path = SYSCALLS.calculateAt(dirfd, path);
				FS.mkdir(path, mode, 0);
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_newfstatat(dirfd, path, buf, flags) {
			try {
				path = SYSCALLS.getStr(path);
				var nofollow = flags & 256;
				var allowEmpty = flags & 4096;
				flags = flags & ~6400;
				assert(!flags, `unknown flags in __syscall_newfstatat: ${flags}`);
				path = SYSCALLS.calculateAt(dirfd, path, allowEmpty);
				return SYSCALLS.doStat(nofollow ? FS.lstat : FS.stat, path, buf);
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_openat(dirfd, path, flags, varargs) {
			SYSCALLS.varargs = varargs;
			try {
				path = SYSCALLS.getStr(path);
				path = SYSCALLS.calculateAt(dirfd, path);
				var mode = varargs ? syscallGetVarargI() : 0;
				return FS.open(path, flags, mode).fd;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		var PIPEFS = {
			BUCKET_BUFFER_SIZE: 8192,
			mount(mount) {
				// Do not pollute the real root directory or its child nodes with pipes
				// Looks like it is OK to create another pseudo-root node not linked to the FS.root hierarchy this way
				return FS.createNode(null, "/", 16384 | 0o777, 0);
			},
			createPipe() {
				var pipe = {
					buckets: [],
					// refcnt 2 because pipe has a read end and a write end. We need to be
					// able to read from the read end after write end is closed.
					refcnt: 2,
				};

				pipe.buckets.push({
					buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
					offset: 0,
					roffset: 0,
				});

				var rName = PIPEFS.nextname();
				var wName = PIPEFS.nextname();
				var rNode = FS.createNode(PIPEFS.root, rName, 4096, 0);
				var wNode = FS.createNode(PIPEFS.root, wName, 4096, 0);

				rNode.pipe = pipe;
				wNode.pipe = pipe;

				var readableStream = FS.createStream({
					path: rName,
					node: rNode,
					flags: 0,
					seekable: false,
					stream_ops: PIPEFS.stream_ops,
				});
				rNode.stream = readableStream;

				var writableStream = FS.createStream({
					path: wName,
					node: wNode,
					flags: 1,
					seekable: false,
					stream_ops: PIPEFS.stream_ops,
				});
				wNode.stream = writableStream;

				return {
					readable_fd: readableStream.fd,
					writable_fd: writableStream.fd,
				};
			},
			stream_ops: {
				poll(stream) {
					var pipe = stream.node.pipe;

					if ((stream.flags & 2097155) === 1) {
						return 256 | 4;
					}
					if (pipe.buckets.length > 0) {
						for (var i = 0; i < pipe.buckets.length; i++) {
							var bucket = pipe.buckets[i];
							if (bucket.offset - bucket.roffset > 0) {
								return 64 | 1;
							}
						}
					}

					return 0;
				},
				ioctl(stream, request, varargs) {
					return 28;
				},
				fsync(stream) {
					return 28;
				},
				read(stream, buffer, offset, length, position /* ignored */) {
					var pipe = stream.node.pipe;
					var currentLength = 0;

					for (var i = 0; i < pipe.buckets.length; i++) {
						var bucket = pipe.buckets[i];
						currentLength += bucket.offset - bucket.roffset;
					}

					assert(buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer));
					var data = buffer.subarray(offset, offset + length);

					if (length <= 0) {
						return 0;
					}
					if (currentLength == 0) {
						// Behave as if the read end is always non-blocking
						throw new FS.ErrnoError(6);
					}
					var toRead = Math.min(currentLength, length);

					var totalRead = toRead;
					var toRemove = 0;

					for (var i = 0; i < pipe.buckets.length; i++) {
						var currBucket = pipe.buckets[i];
						var bucketSize = currBucket.offset - currBucket.roffset;

						if (toRead <= bucketSize) {
							var tmpSlice = currBucket.buffer.subarray(
								currBucket.roffset,
								currBucket.offset,
							);
							if (toRead < bucketSize) {
								tmpSlice = tmpSlice.subarray(0, toRead);
								currBucket.roffset += toRead;
							} else {
								toRemove++;
							}
							data.set(tmpSlice);
							break;
						} else {
							var tmpSlice = currBucket.buffer.subarray(
								currBucket.roffset,
								currBucket.offset,
							);
							data.set(tmpSlice);
							data = data.subarray(tmpSlice.byteLength);
							toRead -= tmpSlice.byteLength;
							toRemove++;
						}
					}

					if (toRemove && toRemove == pipe.buckets.length) {
						// Do not generate excessive garbage in use cases such as
						// write several bytes, read everything, write several bytes, read everything...
						toRemove--;
						pipe.buckets[toRemove].offset = 0;
						pipe.buckets[toRemove].roffset = 0;
					}

					pipe.buckets.splice(0, toRemove);

					return totalRead;
				},
				write(stream, buffer, offset, length, position /* ignored */) {
					var pipe = stream.node.pipe;

					assert(buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer));
					var data = buffer.subarray(offset, offset + length);

					var dataLen = data.byteLength;
					if (dataLen <= 0) {
						return 0;
					}

					var currBucket = null;

					if (pipe.buckets.length == 0) {
						currBucket = {
							buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
							offset: 0,
							roffset: 0,
						};
						pipe.buckets.push(currBucket);
					} else {
						currBucket = pipe.buckets[pipe.buckets.length - 1];
					}

					assert(currBucket.offset <= PIPEFS.BUCKET_BUFFER_SIZE);

					var freeBytesInCurrBuffer =
						PIPEFS.BUCKET_BUFFER_SIZE - currBucket.offset;
					if (freeBytesInCurrBuffer >= dataLen) {
						currBucket.buffer.set(data, currBucket.offset);
						currBucket.offset += dataLen;
						return dataLen;
					} else if (freeBytesInCurrBuffer > 0) {
						currBucket.buffer.set(
							data.subarray(0, freeBytesInCurrBuffer),
							currBucket.offset,
						);
						currBucket.offset += freeBytesInCurrBuffer;
						data = data.subarray(freeBytesInCurrBuffer, data.byteLength);
					}

					var numBuckets = (data.byteLength / PIPEFS.BUCKET_BUFFER_SIZE) | 0;
					var remElements = data.byteLength % PIPEFS.BUCKET_BUFFER_SIZE;

					for (var i = 0; i < numBuckets; i++) {
						var newBucket = {
							buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
							offset: PIPEFS.BUCKET_BUFFER_SIZE,
							roffset: 0,
						};
						pipe.buckets.push(newBucket);
						newBucket.buffer.set(data.subarray(0, PIPEFS.BUCKET_BUFFER_SIZE));
						data = data.subarray(PIPEFS.BUCKET_BUFFER_SIZE, data.byteLength);
					}

					if (remElements > 0) {
						var newBucket = {
							buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
							offset: data.byteLength,
							roffset: 0,
						};
						pipe.buckets.push(newBucket);
						newBucket.buffer.set(data);
					}

					return dataLen;
				},
				close(stream) {
					var pipe = stream.node.pipe;
					pipe.refcnt--;
					if (pipe.refcnt === 0) {
						pipe.buckets = null;
					}
				},
			},
			nextname() {
				if (!PIPEFS.nextname.current) {
					PIPEFS.nextname.current = 0;
				}
				return "pipe[" + PIPEFS.nextname.current++ + "]";
			},
		};
		function ___syscall_pipe(fdPtr) {
			try {
				if (fdPtr == 0) {
					throw new FS.ErrnoError(21);
				}

				var res = PIPEFS.createPipe();

				HEAP32[fdPtr >> 2] = res.readable_fd;
				HEAP32[(fdPtr + 4) >> 2] = res.writable_fd;

				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_poll(fds, nfds, timeout) {
			try {
				var nonzero = 0;
				for (var i = 0; i < nfds; i++) {
					var pollfd = fds + 8 * i;
					var fd = HEAP32[pollfd >> 2];
					var events = HEAP16[(pollfd + 4) >> 1];
					var mask = 32;
					var stream = FS.getStream(fd);
					if (stream) {
						mask = SYSCALLS.DEFAULT_POLLMASK;
						if (stream.stream_ops.poll) {
							mask = stream.stream_ops.poll(stream, -1);
						}
					}
					mask &= events | 8 | 16;
					if (mask) nonzero++;
					HEAP16[(pollfd + 6) >> 1] = mask;
				}
				return nonzero;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_readlinkat(dirfd, path, buf, bufsize) {
			try {
				path = SYSCALLS.getStr(path);
				path = SYSCALLS.calculateAt(dirfd, path);
				if (bufsize <= 0) return -28;
				var ret = FS.readlink(path);

				var len = Math.min(bufsize, lengthBytesUTF8(ret));
				var endChar = HEAP8[buf + len];
				stringToUTF8(ret, buf, bufsize + 1);
				// readlink is one of the rare functions that write out a C string, but does never append a null to the output buffer(!)
				// stringToUTF8() always appends a null byte, so restore the character under the null byte after the write.
				HEAP8[buf + len] = endChar;
				return len;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_recvfrom(fd, buf, len, flags, addr, addrlen) {
			try {
				var sock = getSocketFromFD(fd);
				var msg = sock.sock_ops.recvmsg(sock, len);
				if (!msg) return 0; // socket is closed
				if (addr) {
					var errno = writeSockaddr(
						addr,
						sock.family,
						DNS.lookup_name(msg.addr),
						msg.port,
						addrlen,
					);
					assert(!errno);
				}
				HEAPU8.set(msg.buffer, buf);
				return msg.buffer.byteLength;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_renameat(olddirfd, oldpath, newdirfd, newpath) {
			try {
				oldpath = SYSCALLS.getStr(oldpath);
				newpath = SYSCALLS.getStr(newpath);
				oldpath = SYSCALLS.calculateAt(olddirfd, oldpath);
				newpath = SYSCALLS.calculateAt(newdirfd, newpath);
				FS.rename(oldpath, newpath);
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_rmdir(path) {
			try {
				path = SYSCALLS.getStr(path);
				FS.rmdir(path);
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_sendto(fd, message, length, flags, addr, addr_len) {
			try {
				var sock = getSocketFromFD(fd);
				if (!addr) {
					// send, no address provided
					return FS.write(sock.stream, HEAP8, message, length);
				}
				var dest = getSocketAddress(addr, addr_len);
				// sendto an address
				return sock.sock_ops.sendmsg(
					sock,
					HEAP8,
					message,
					length,
					dest.addr,
					dest.port,
				);
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_socket(domain, type, protocol) {
			try {
				var sock = SOCKFS.createSocket(domain, type, protocol);
				assert(sock.stream.fd < 64); // XXX ? select() assumes socket fd values are in 0..63
				return sock.stream.fd;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_stat64(path, buf) {
			try {
				path = SYSCALLS.getStr(path);
				return SYSCALLS.doStat(FS.stat, path, buf);
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_statfs64(path, size, buf) {
			try {
				assert(size === 64);
				var stats = FS.statfs(SYSCALLS.getStr(path));
				HEAP32[(buf + 4) >> 2] = stats.bsize;
				HEAP32[(buf + 40) >> 2] = stats.bsize;
				HEAP32[(buf + 8) >> 2] = stats.blocks;
				HEAP32[(buf + 12) >> 2] = stats.bfree;
				HEAP32[(buf + 16) >> 2] = stats.bavail;
				HEAP32[(buf + 20) >> 2] = stats.files;
				HEAP32[(buf + 24) >> 2] = stats.ffree;
				HEAP32[(buf + 28) >> 2] = stats.fsid;
				HEAP32[(buf + 44) >> 2] = stats.flags; // ST_NOSUID
				HEAP32[(buf + 36) >> 2] = stats.namelen;
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_symlinkat(target, dirfd, linkpath) {
			try {
				target = SYSCALLS.getStr(target);
				linkpath = SYSCALLS.getStr(linkpath);
				linkpath = SYSCALLS.calculateAt(dirfd, linkpath);
				FS.symlink(target, linkpath);
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function ___syscall_unlinkat(dirfd, path, flags) {
			try {
				path = SYSCALLS.getStr(path);
				path = SYSCALLS.calculateAt(dirfd, path);
				if (flags === 0) {
					FS.unlink(path);
				} else if (flags === 512) {
					FS.rmdir(path);
				} else {
					abort("Invalid flags passed to unlinkat");
				}
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		var readI53FromI64 = (ptr) => {
			return HEAPU32[ptr >> 2] + HEAP32[(ptr + 4) >> 2] * 4294967296;
		};

		function ___syscall_utimensat(dirfd, path, times, flags) {
			try {
				path = SYSCALLS.getStr(path);
				assert(flags === 0);
				path = SYSCALLS.calculateAt(dirfd, path, true);
				var now = Date.now(),
					atime,
					mtime;
				if (!times) {
					atime = now;
					mtime = now;
				} else {
					var seconds = readI53FromI64(times);
					var nanoseconds = HEAP32[(times + 8) >> 2];
					if (nanoseconds == 1073741823) {
						atime = now;
					} else if (nanoseconds == 1073741822) {
						atime = null;
					} else {
						atime = seconds * 1000 + nanoseconds / (1000 * 1000);
					}
					times += 16;
					seconds = readI53FromI64(times);
					nanoseconds = HEAP32[(times + 8) >> 2];
					if (nanoseconds == 1073741823) {
						mtime = now;
					} else if (nanoseconds == 1073741822) {
						mtime = null;
					} else {
						mtime = seconds * 1000 + nanoseconds / (1000 * 1000);
					}
				}
				// null here means UTIME_OMIT was passed. If both were set to UTIME_OMIT then
				// we can skip the call completely.
				if ((mtime ?? atime) !== null) {
					FS.utime(path, atime, mtime);
				}
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		var __abort_js = () => abort("native code called abort()");

		var __emscripten_lookup_name = (name) => {
			// uint32_t _emscripten_lookup_name(const char *name);
			var nameString = UTF8ToString(name);
			return inetPton4(DNS.lookup_name(nameString));
		};

		var __emscripten_memcpy_js = (dest, src, num) =>
			HEAPU8.copyWithin(dest, src, src + num);

		var runtimeKeepaliveCounter = 0;
		var __emscripten_runtime_keepalive_clear = () => {
			noExitRuntime = false;
			runtimeKeepaliveCounter = 0;
		};

		var __emscripten_throw_longjmp = () => {
			throw Infinity;
		};

		function __gmtime_js(time_low, time_high, tmPtr) {
			var time = convertI32PairToI53Checked(time_low, time_high);

			var date = new Date(time * 1000);
			HEAP32[tmPtr >> 2] = date.getUTCSeconds();
			HEAP32[(tmPtr + 4) >> 2] = date.getUTCMinutes();
			HEAP32[(tmPtr + 8) >> 2] = date.getUTCHours();
			HEAP32[(tmPtr + 12) >> 2] = date.getUTCDate();
			HEAP32[(tmPtr + 16) >> 2] = date.getUTCMonth();
			HEAP32[(tmPtr + 20) >> 2] = date.getUTCFullYear() - 1900;
			HEAP32[(tmPtr + 24) >> 2] = date.getUTCDay();
			var start = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
			var yday = ((date.getTime() - start) / (1000 * 60 * 60 * 24)) | 0;
			HEAP32[(tmPtr + 28) >> 2] = yday;
		}

		var isLeapYear = (year) =>
			year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

		var MONTH_DAYS_LEAP_CUMULATIVE = [
			0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335,
		];

		var MONTH_DAYS_REGULAR_CUMULATIVE = [
			0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334,
		];
		var ydayFromDate = (date) => {
			var leap = isLeapYear(date.getFullYear());
			var monthDaysCumulative = leap
				? MONTH_DAYS_LEAP_CUMULATIVE
				: MONTH_DAYS_REGULAR_CUMULATIVE;
			var yday = monthDaysCumulative[date.getMonth()] + date.getDate() - 1; // -1 since it's days since Jan 1

			return yday;
		};

		function __localtime_js(time_low, time_high, tmPtr) {
			var time = convertI32PairToI53Checked(time_low, time_high);

			var date = new Date(time * 1000);
			HEAP32[tmPtr >> 2] = date.getSeconds();
			HEAP32[(tmPtr + 4) >> 2] = date.getMinutes();
			HEAP32[(tmPtr + 8) >> 2] = date.getHours();
			HEAP32[(tmPtr + 12) >> 2] = date.getDate();
			HEAP32[(tmPtr + 16) >> 2] = date.getMonth();
			HEAP32[(tmPtr + 20) >> 2] = date.getFullYear() - 1900;
			HEAP32[(tmPtr + 24) >> 2] = date.getDay();

			var yday = ydayFromDate(date) | 0;
			HEAP32[(tmPtr + 28) >> 2] = yday;
			HEAP32[(tmPtr + 36) >> 2] = -(date.getTimezoneOffset() * 60);

			// Attention: DST is in December in South, and some regions don't have DST at all.
			var start = new Date(date.getFullYear(), 0, 1);
			var summerOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
			var winterOffset = start.getTimezoneOffset();
			var dst =
				(summerOffset != winterOffset &&
					date.getTimezoneOffset() == Math.min(winterOffset, summerOffset)) | 0;
			HEAP32[(tmPtr + 32) >> 2] = dst;
		}

		/** @suppress {duplicate } */
		var setTempRet0 = (val) => __emscripten_tempret_set(val);
		var _setTempRet0 = setTempRet0;

		var __mktime_js = function (tmPtr) {
			var ret = (() => {
				var date = new Date(
					HEAP32[(tmPtr + 20) >> 2] + 1900,
					HEAP32[(tmPtr + 16) >> 2],
					HEAP32[(tmPtr + 12) >> 2],
					HEAP32[(tmPtr + 8) >> 2],
					HEAP32[(tmPtr + 4) >> 2],
					HEAP32[tmPtr >> 2],
					0,
				);

				// There's an ambiguous hour when the time goes back; the tm_isdst field is
				// used to disambiguate it.  Date() basically guesses, so we fix it up if it
				// guessed wrong, or fill in tm_isdst with the guess if it's -1.
				var dst = HEAP32[(tmPtr + 32) >> 2];
				var guessedOffset = date.getTimezoneOffset();
				var start = new Date(date.getFullYear(), 0, 1);
				var summerOffset = new Date(
					date.getFullYear(),
					6,
					1,
				).getTimezoneOffset();
				var winterOffset = start.getTimezoneOffset();
				var dstOffset = Math.min(winterOffset, summerOffset); // DST is in December in South
				if (dst < 0) {
					// Attention: some regions don't have DST at all.
					HEAP32[(tmPtr + 32) >> 2] = Number(
						summerOffset != winterOffset && dstOffset == guessedOffset,
					);
				} else if (dst > 0 != (dstOffset == guessedOffset)) {
					var nonDstOffset = Math.max(winterOffset, summerOffset);
					var trueOffset = dst > 0 ? dstOffset : nonDstOffset;
					// Don't try setMinutes(date.getMinutes() + ...) -- it's messed up.
					date.setTime(date.getTime() + (trueOffset - guessedOffset) * 60000);
				}

				HEAP32[(tmPtr + 24) >> 2] = date.getDay();
				var yday = ydayFromDate(date) | 0;
				HEAP32[(tmPtr + 28) >> 2] = yday;
				// To match expected behavior, update fields from date
				HEAP32[tmPtr >> 2] = date.getSeconds();
				HEAP32[(tmPtr + 4) >> 2] = date.getMinutes();
				HEAP32[(tmPtr + 8) >> 2] = date.getHours();
				HEAP32[(tmPtr + 12) >> 2] = date.getDate();
				HEAP32[(tmPtr + 16) >> 2] = date.getMonth();
				HEAP32[(tmPtr + 20) >> 2] = date.getYear();

				var timeMs = date.getTime();
				if (isNaN(timeMs)) {
					return -1;
				}
				// Return time in microseconds
				return timeMs / 1000;
			})();
			return (
				setTempRet0(
					((tempDouble = ret),
					+Math.abs(tempDouble) >= 1.0
						? tempDouble > 0.0
							? +Math.floor(tempDouble / 4294967296.0) >>> 0
							: ~~+Math.ceil(
									(tempDouble - +(~~tempDouble >>> 0)) / 4294967296.0,
								) >>> 0
						: 0),
				),
				ret >>> 0
			);
		};

		function __mmap_js(
			len,
			prot,
			flags,
			fd,
			offset_low,
			offset_high,
			allocated,
			addr,
		) {
			var offset = convertI32PairToI53Checked(offset_low, offset_high);

			try {
				if (isNaN(offset)) return 61;
				var stream = SYSCALLS.getStreamFromFD(fd);
				var res = FS.mmap(stream, len, offset, prot, flags);
				var ptr = res.ptr;
				HEAP32[allocated >> 2] = res.allocated;
				HEAPU32[addr >> 2] = ptr;
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		function __munmap_js(addr, len, prot, flags, fd, offset_low, offset_high) {
			var offset = convertI32PairToI53Checked(offset_low, offset_high);

			try {
				var stream = SYSCALLS.getStreamFromFD(fd);
				if (prot & 2) {
					SYSCALLS.doMsync(addr, stream, len, flags, offset);
				}
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return -e.errno;
			}
		}

		var timers = {};

		var handleException = (e) => {
			// Certain exception types we do not treat as errors since they are used for
			// internal control flow.
			// 1. ExitStatus, which is thrown by exit()
			// 2. "unwind", which is thrown by emscripten_unwind_to_js_event_loop() and others
			//    that wish to return to JS event loop.
			if (e instanceof ExitStatus || e == "unwind") {
				return EXITSTATUS;
			}
			checkStackCookie();
			if (e instanceof WebAssembly.RuntimeError) {
				if (_emscripten_stack_get_current() <= 0) {
					err(
						"Stack overflow detected.  You can try increasing -sSTACK_SIZE (currently set to 65536)",
					);
				}
			}
			quit_(1, e);
		};

		var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
		var _proc_exit = (code) => {
			EXITSTATUS = code;
			if (!keepRuntimeAlive()) {
				Module["onExit"]?.(code);
				ABORT = true;
			}
			quit_(code, new ExitStatus(code));
		};

		/** @suppress {duplicate } */
		/** @param {boolean|number=} implicit */
		var exitJS = (status, implicit) => {
			EXITSTATUS = status;

			checkUnflushedContent();

			// if exit() was called explicitly, warn the user if the runtime isn't actually being shut down
			if (keepRuntimeAlive() && !implicit) {
				var msg = `program exited (with status: ${status}), but keepRuntimeAlive() is set (counter=${runtimeKeepaliveCounter}) due to an async operation, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)`;
				readyPromiseReject(msg);
				err(msg);
			}

			_proc_exit(status);
		};
		var _exit = exitJS;

		var maybeExit = () => {
			if (!keepRuntimeAlive()) {
				try {
					_exit(EXITSTATUS);
				} catch (e) {
					handleException(e);
				}
			}
		};
		var callUserCallback = (func) => {
			if (ABORT) {
				err(
					"user callback triggered after runtime exited or application aborted.  Ignoring.",
				);
				return;
			}
			try {
				func();
				maybeExit();
			} catch (e) {
				handleException(e);
			}
		};

		var _emscripten_get_now = () => performance.now();
		var __setitimer_js = (which, timeout_ms) => {
			// First, clear any existing timer.
			if (timers[which]) {
				clearTimeout(timers[which].id);
				delete timers[which];
			}

			// A timeout of zero simply cancels the current timeout so we have nothing
			// more to do.
			if (!timeout_ms) return 0;

			var id = setTimeout(() => {
				assert(which in timers);
				delete timers[which];
				callUserCallback(() =>
					__emscripten_timeout(which, _emscripten_get_now()),
				);
			}, timeout_ms);
			timers[which] = { id, timeout_ms };
			return 0;
		};

		var __tzset_js = (timezone, daylight, std_name, dst_name) => {
			// TODO: Use (malleable) environment variables instead of system settings.
			var currentYear = new Date().getFullYear();
			var winter = new Date(currentYear, 0, 1);
			var summer = new Date(currentYear, 6, 1);
			var winterOffset = winter.getTimezoneOffset();
			var summerOffset = summer.getTimezoneOffset();

			// Local standard timezone offset. Local standard time is not adjusted for
			// daylight savings.  This code uses the fact that getTimezoneOffset returns
			// a greater value during Standard Time versus Daylight Saving Time (DST).
			// Thus it determines the expected output during Standard Time, and it
			// compares whether the output of the given date the same (Standard) or less
			// (DST).
			var stdTimezoneOffset = Math.max(winterOffset, summerOffset);

			// timezone is specified as seconds west of UTC ("The external variable
			// `timezone` shall be set to the difference, in seconds, between
			// Coordinated Universal Time (UTC) and local standard time."), the same
			// as returned by stdTimezoneOffset.
			// See http://pubs.opengroup.org/onlinepubs/009695399/functions/tzset.html
			HEAPU32[timezone >> 2] = stdTimezoneOffset * 60;

			HEAP32[daylight >> 2] = Number(winterOffset != summerOffset);

			var extractZone = (timezoneOffset) => {
				// Why inverse sign?
				// Read here https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset
				var sign = timezoneOffset >= 0 ? "-" : "+";

				var absOffset = Math.abs(timezoneOffset);
				var hours = String(Math.floor(absOffset / 60)).padStart(2, "0");
				var minutes = String(absOffset % 60).padStart(2, "0");

				return `UTC${sign}${hours}${minutes}`;
			};

			var winterName = extractZone(winterOffset);
			var summerName = extractZone(summerOffset);
			assert(winterName);
			assert(summerName);
			assert(
				lengthBytesUTF8(winterName) <= 16,
				`timezone name truncated to fit in TZNAME_MAX (${winterName})`,
			);
			assert(
				lengthBytesUTF8(summerName) <= 16,
				`timezone name truncated to fit in TZNAME_MAX (${summerName})`,
			);
			if (summerOffset < winterOffset) {
				// Northern hemisphere
				stringToUTF8(winterName, std_name, 17);
				stringToUTF8(summerName, dst_name, 17);
			} else {
				stringToUTF8(winterName, dst_name, 17);
				stringToUTF8(summerName, std_name, 17);
			}
		};

		var _emscripten_date_now = () => Date.now();

		var nowIsMonotonic = 1;

		var checkWasiClock = (clock_id) => clock_id >= 0 && clock_id <= 3;

		function _clock_time_get(
			clk_id,
			ignored_precision_low,
			ignored_precision_high,
			ptime,
		) {
			var ignored_precision = convertI32PairToI53Checked(
				ignored_precision_low,
				ignored_precision_high,
			);

			if (!checkWasiClock(clk_id)) {
				return 28;
			}
			var now;
			// all wasi clocks but realtime are monotonic
			if (clk_id === 0) {
				now = _emscripten_date_now();
			} else if (nowIsMonotonic) {
				now = _emscripten_get_now();
			} else {
				return 52;
			}
			// "now" is in ms, and wasi times are in ns.
			var nsec = Math.round(now * 1000 * 1000);
			(tempI64 = [
				nsec >>> 0,
				((tempDouble = nsec),
				+Math.abs(tempDouble) >= 1.0
					? tempDouble > 0.0
						? +Math.floor(tempDouble / 4294967296.0) >>> 0
						: ~~+Math.ceil(
								(tempDouble - +(~~tempDouble >>> 0)) / 4294967296.0,
							) >>> 0
					: 0),
			]),
				(HEAP32[ptime >> 2] = tempI64[0]),
				(HEAP32[(ptime + 4) >> 2] = tempI64[1]);
			return 0;
		}

		var _emscripten_err = (str) => err(UTF8ToString(str));

		var getHeapMax = () => HEAPU8.length;
		var _emscripten_get_heap_max = () => getHeapMax();

		var abortOnCannotGrowMemory = (requestedSize) => {
			abort(
				`Cannot enlarge memory arrays to size ${requestedSize} bytes (OOM). Either (1) compile with -sINITIAL_MEMORY=X with X higher than the current value ${HEAP8.length}, (2) compile with -sALLOW_MEMORY_GROWTH which allows increasing the size at runtime, or (3) if you want malloc to return NULL (0) instead of this abort, compile with -sABORTING_MALLOC=0`,
			);
		};
		var _emscripten_resize_heap = (requestedSize) => {
			var oldSize = HEAPU8.length;
			// With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
			requestedSize >>>= 0;
			abortOnCannotGrowMemory(requestedSize);
		};

		var ENV = {};

		var getExecutableName = () => thisProgram || "./this.program";
		var getEnvStrings = () => {
			if (!getEnvStrings.strings) {
				// Default values.
				// Browser language detection #8751
				var lang =
					(
						(typeof navigator == "object" &&
							navigator.languages &&
							navigator.languages[0]) ||
						"C"
					).replace("-", "_") + ".UTF-8";
				var env = {
					USER: "web_user",
					LOGNAME: "web_user",
					PATH: "/",
					PWD: "/",
					HOME: "/home/web_user",
					LANG: lang,
					_: getExecutableName(),
				};
				// Apply the user-provided values, if any.
				for (var x in ENV) {
					// x is a key in ENV; if ENV[x] is undefined, that means it was
					// explicitly set to be so. We allow user code to do that to
					// force variables with default values to remain unset.
					if (ENV[x] === undefined) delete env[x];
					else env[x] = ENV[x];
				}
				var strings = [];
				for (var x in env) {
					strings.push(`${x}=${env[x]}`);
				}
				getEnvStrings.strings = strings;
			}
			return getEnvStrings.strings;
		};

		var stringToAscii = (str, buffer) => {
			for (var i = 0; i < str.length; ++i) {
				assert(str.charCodeAt(i) === (str.charCodeAt(i) & 0xff));
				HEAP8[buffer++] = str.charCodeAt(i);
			}
			// Null-terminate the string
			HEAP8[buffer] = 0;
		};
		var _environ_get = (__environ, environ_buf) => {
			var bufSize = 0;
			getEnvStrings().forEach((string, i) => {
				var ptr = environ_buf + bufSize;
				HEAPU32[(__environ + i * 4) >> 2] = ptr;
				stringToAscii(string, ptr);
				bufSize += string.length + 1;
			});
			return 0;
		};

		var _environ_sizes_get = (penviron_count, penviron_buf_size) => {
			var strings = getEnvStrings();
			HEAPU32[penviron_count >> 2] = strings.length;
			var bufSize = 0;
			strings.forEach((string) => (bufSize += string.length + 1));
			HEAPU32[penviron_buf_size >> 2] = bufSize;
			return 0;
		};

		function _fd_close(fd) {
			try {
				var stream = SYSCALLS.getStreamFromFD(fd);
				FS.close(stream);
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return e.errno;
			}
		}

		function _fd_fdstat_get(fd, pbuf) {
			try {
				var rightsBase = 0;
				var rightsInheriting = 0;
				var flags = 0;
				{
					var stream = SYSCALLS.getStreamFromFD(fd);
					// All character devices are terminals (other things a Linux system would
					// assume is a character device, like the mouse, we have special APIs for).
					var type = stream.tty
						? 2
						: FS.isDir(stream.mode)
							? 3
							: FS.isLink(stream.mode)
								? 7
								: 4;
				}
				HEAP8[pbuf] = type;
				HEAP16[(pbuf + 2) >> 1] = flags;
				(tempI64 = [
					rightsBase >>> 0,
					((tempDouble = rightsBase),
					+Math.abs(tempDouble) >= 1.0
						? tempDouble > 0.0
							? +Math.floor(tempDouble / 4294967296.0) >>> 0
							: ~~+Math.ceil(
									(tempDouble - +(~~tempDouble >>> 0)) / 4294967296.0,
								) >>> 0
						: 0),
				]),
					(HEAP32[(pbuf + 8) >> 2] = tempI64[0]),
					(HEAP32[(pbuf + 12) >> 2] = tempI64[1]);
				(tempI64 = [
					rightsInheriting >>> 0,
					((tempDouble = rightsInheriting),
					+Math.abs(tempDouble) >= 1.0
						? tempDouble > 0.0
							? +Math.floor(tempDouble / 4294967296.0) >>> 0
							: ~~+Math.ceil(
									(tempDouble - +(~~tempDouble >>> 0)) / 4294967296.0,
								) >>> 0
						: 0),
				]),
					(HEAP32[(pbuf + 16) >> 2] = tempI64[0]),
					(HEAP32[(pbuf + 20) >> 2] = tempI64[1]);
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return e.errno;
			}
		}

		/** @param {number=} offset */
		var doReadv = (stream, iov, iovcnt, offset) => {
			var ret = 0;
			for (var i = 0; i < iovcnt; i++) {
				var ptr = HEAPU32[iov >> 2];
				var len = HEAPU32[(iov + 4) >> 2];
				iov += 8;
				var curr = FS.read(stream, HEAP8, ptr, len, offset);
				if (curr < 0) return -1;
				ret += curr;
				if (curr < len) break; // nothing more to read
				if (typeof offset != "undefined") {
					offset += curr;
				}
			}
			return ret;
		};

		function _fd_read(fd, iov, iovcnt, pnum) {
			try {
				var stream = SYSCALLS.getStreamFromFD(fd);
				var num = doReadv(stream, iov, iovcnt);
				HEAPU32[pnum >> 2] = num;
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return e.errno;
			}
		}

		function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {
			var offset = convertI32PairToI53Checked(offset_low, offset_high);

			try {
				if (isNaN(offset)) return 61;
				var stream = SYSCALLS.getStreamFromFD(fd);
				FS.llseek(stream, offset, whence);
				(tempI64 = [
					stream.position >>> 0,
					((tempDouble = stream.position),
					+Math.abs(tempDouble) >= 1.0
						? tempDouble > 0.0
							? +Math.floor(tempDouble / 4294967296.0) >>> 0
							: ~~+Math.ceil(
									(tempDouble - +(~~tempDouble >>> 0)) / 4294967296.0,
								) >>> 0
						: 0),
				]),
					(HEAP32[newOffset >> 2] = tempI64[0]),
					(HEAP32[(newOffset + 4) >> 2] = tempI64[1]);
				if (stream.getdents && offset === 0 && whence === 0)
					stream.getdents = null; // reset readdir state
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return e.errno;
			}
		}

		function _fd_sync(fd) {
			try {
				var stream = SYSCALLS.getStreamFromFD(fd);
				if (stream.stream_ops?.fsync) {
					return stream.stream_ops.fsync(stream);
				}
				return 0; // we can't do anything synchronously; the in-memory FS is already synced to
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return e.errno;
			}
		}

		/** @param {number=} offset */
		var doWritev = (stream, iov, iovcnt, offset) => {
			var ret = 0;
			for (var i = 0; i < iovcnt; i++) {
				var ptr = HEAPU32[iov >> 2];
				var len = HEAPU32[(iov + 4) >> 2];
				iov += 8;
				var curr = FS.write(stream, HEAP8, ptr, len, offset);
				if (curr < 0) return -1;
				ret += curr;
				if (curr < len) {
					// No more space to write.
					break;
				}
				if (typeof offset != "undefined") {
					offset += curr;
				}
			}
			return ret;
		};

		function _fd_write(fd, iov, iovcnt, pnum) {
			try {
				var stream = SYSCALLS.getStreamFromFD(fd);
				var num = doWritev(stream, iov, iovcnt);
				HEAPU32[pnum >> 2] = num;
				return 0;
			} catch (e) {
				if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
				return e.errno;
			}
		}

		var _getaddrinfo = (node, service, hint, out) => {
			// Note getaddrinfo currently only returns a single addrinfo with ai_next defaulting to NULL. When NULL
			// hints are specified or ai_family set to AF_UNSPEC or ai_socktype or ai_protocol set to 0 then we
			// really should provide a linked list of suitable addrinfo values.
			var addrs = [];
			var canon = null;
			var addr = 0;
			var port = 0;
			var flags = 0;
			var family = 0;
			var type = 0;
			var proto = 0;
			var ai, last;

			function allocaddrinfo(family, type, proto, canon, addr, port) {
				var sa, salen, ai;
				var errno;

				salen = family === 10 ? 28 : 16;
				addr = family === 10 ? inetNtop6(addr) : inetNtop4(addr);
				sa = _malloc(salen);
				errno = writeSockaddr(sa, family, addr, port);
				assert(!errno);

				ai = _malloc(32);
				HEAP32[(ai + 4) >> 2] = family;
				HEAP32[(ai + 8) >> 2] = type;
				HEAP32[(ai + 12) >> 2] = proto;
				HEAPU32[(ai + 24) >> 2] = canon;
				HEAPU32[(ai + 20) >> 2] = sa;
				if (family === 10) {
					HEAP32[(ai + 16) >> 2] = 28;
				} else {
					HEAP32[(ai + 16) >> 2] = 16;
				}
				HEAP32[(ai + 28) >> 2] = 0;

				return ai;
			}

			if (hint) {
				flags = HEAP32[hint >> 2];
				family = HEAP32[(hint + 4) >> 2];
				type = HEAP32[(hint + 8) >> 2];
				proto = HEAP32[(hint + 12) >> 2];
			}
			if (type && !proto) {
				proto = type === 2 ? 17 : 6;
			}
			if (!type && proto) {
				type = proto === 17 ? 2 : 1;
			}

			// If type or proto are set to zero in hints we should really be returning multiple addrinfo values, but for
			// now default to a TCP STREAM socket so we can at least return a sensible addrinfo given NULL hints.
			if (proto === 0) {
				proto = 6;
			}
			if (type === 0) {
				type = 1;
			}

			if (!node && !service) {
				return -2;
			}
			if (flags & ~(1 | 2 | 4 | 1024 | 8 | 16 | 32)) {
				return -1;
			}
			if (hint !== 0 && HEAP32[hint >> 2] & 2 && !node) {
				return -1;
			}
			if (flags & 32) {
				// TODO
				return -2;
			}
			if (type !== 0 && type !== 1 && type !== 2) {
				return -7;
			}
			if (family !== 0 && family !== 2 && family !== 10) {
				return -6;
			}

			if (service) {
				service = UTF8ToString(service);
				port = parseInt(service, 10);

				if (isNaN(port)) {
					if (flags & 1024) {
						return -2;
					}
					// TODO support resolving well-known service names from:
					// http://www.iana.org/assignments/service-names-port-numbers/service-names-port-numbers.txt
					return -8;
				}
			}

			if (!node) {
				if (family === 0) {
					family = 2;
				}
				if ((flags & 1) === 0) {
					if (family === 2) {
						addr = _htonl(2130706433);
					} else {
						addr = [0, 0, 0, _htonl(1)];
					}
				}
				ai = allocaddrinfo(family, type, proto, null, addr, port);
				HEAPU32[out >> 2] = ai;
				return 0;
			}

			//
			// try as a numeric address
			//
			node = UTF8ToString(node);
			addr = inetPton4(node);
			if (addr !== null) {
				// incoming node is a valid ipv4 address
				if (family === 0 || family === 2) {
					family = 2;
				} else if (family === 10 && flags & 8) {
					addr = [0, 0, _htonl(0xffff), addr];
					family = 10;
				} else {
					return -2;
				}
			} else {
				addr = inetPton6(node);
				if (addr !== null) {
					// incoming node is a valid ipv6 address
					if (family === 0 || family === 10) {
						family = 10;
					} else {
						return -2;
					}
				}
			}
			if (addr != null) {
				ai = allocaddrinfo(family, type, proto, node, addr, port);
				HEAPU32[out >> 2] = ai;
				return 0;
			}
			if (flags & 4) {
				return -2;
			}

			//
			// try as a hostname
			//
			// resolve the hostname to a temporary fake address
			node = DNS.lookup_name(node);
			addr = inetPton4(node);
			if (family === 0) {
				family = 2;
			} else if (family === 10) {
				addr = [0, 0, _htonl(0xffff), addr];
			}
			ai = allocaddrinfo(family, type, proto, null, addr, port);
			HEAPU32[out >> 2] = ai;
			return 0;
		};

		/** @type {function(...*):?} */
		function _getcontext() {
			abort("missing function: getcontext");
		}
		_getcontext.stub = true;

		/** @type {function(...*):?} */
		function _getdtablesize() {
			abort("missing function: getdtablesize");
		}
		_getdtablesize.stub = true;

		var _getnameinfo = (sa, salen, node, nodelen, serv, servlen, flags) => {
			var info = readSockaddr(sa, salen);
			if (info.errno) {
				return -6;
			}
			var port = info.port;
			var addr = info.addr;

			var overflowed = false;

			if (node && nodelen) {
				var lookup;
				if (flags & 1 || !(lookup = DNS.lookup_addr(addr))) {
					if (flags & 8) {
						return -2;
					}
				} else {
					addr = lookup;
				}
				var numBytesWrittenExclNull = stringToUTF8(addr, node, nodelen);

				if (numBytesWrittenExclNull + 1 >= nodelen) {
					overflowed = true;
				}
			}

			if (serv && servlen) {
				port = "" + port;
				var numBytesWrittenExclNull = stringToUTF8(port, serv, servlen);

				if (numBytesWrittenExclNull + 1 >= servlen) {
					overflowed = true;
				}
			}

			if (overflowed) {
				// Note: even when we overflow, getnameinfo() is specced to write out the truncated results.
				return -12;
			}

			return 0;
		};

		var Protocols = {
			list: [],
			map: {},
		};

		var _setprotoent = (stayopen) => {
			// void setprotoent(int stayopen);

			// Allocate and populate a protoent structure given a name, protocol number and array of aliases
			function allocprotoent(name, proto, aliases) {
				// write name into buffer
				var nameBuf = _malloc(name.length + 1);
				stringToAscii(name, nameBuf);

				// write aliases into buffer
				var j = 0;
				var length = aliases.length;
				var aliasListBuf = _malloc((length + 1) * 4); // Use length + 1 so we have space for the terminating NULL ptr.

				for (var i = 0; i < length; i++, j += 4) {
					var alias = aliases[i];
					var aliasBuf = _malloc(alias.length + 1);
					stringToAscii(alias, aliasBuf);
					HEAPU32[(aliasListBuf + j) >> 2] = aliasBuf;
				}
				HEAPU32[(aliasListBuf + j) >> 2] = 0; // Terminating NULL pointer.

				// generate protoent
				var pe = _malloc(12);
				HEAPU32[pe >> 2] = nameBuf;
				HEAPU32[(pe + 4) >> 2] = aliasListBuf;
				HEAP32[(pe + 8) >> 2] = proto;
				return pe;
			}

			// Populate the protocol 'database'. The entries are limited to tcp and udp, though it is fairly trivial
			// to add extra entries from /etc/protocols if desired - though not sure if that'd actually be useful.
			var list = Protocols.list;
			var map = Protocols.map;
			if (list.length === 0) {
				var entry = allocprotoent("tcp", 6, ["TCP"]);
				list.push(entry);
				map["tcp"] = map["6"] = entry;
				entry = allocprotoent("udp", 17, ["UDP"]);
				list.push(entry);
				map["udp"] = map["17"] = entry;
			}

			_setprotoent.index = 0;
		};

		var _getprotobyname = (name) => {
			// struct protoent *getprotobyname(const char *);
			name = UTF8ToString(name);
			_setprotoent(true);
			var result = Protocols.map[name];
			return result;
		};

		var _getprotobynumber = (number) => {
			// struct protoent *getprotobynumber(int proto);
			_setprotoent(true);
			var result = Protocols.map[number];
			return result;
		};

		/** @type {function(...*):?} */
		function _makecontext() {
			abort("missing function: makecontext");
		}
		_makecontext.stub = true;

		/** @type {function(...*):?} */
		function _posix_spawnp() {
			abort("missing function: posix_spawnp");
		}
		_posix_spawnp.stub = true;

		var arraySum = (array, index) => {
			var sum = 0;
			for (var i = 0; i <= index; sum += array[i++]) {
				// no-op
			}
			return sum;
		};

		var MONTH_DAYS_LEAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

		var MONTH_DAYS_REGULAR = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
		var addDays = (date, days) => {
			var newDate = new Date(date.getTime());
			while (days > 0) {
				var leap = isLeapYear(newDate.getFullYear());
				var currentMonth = newDate.getMonth();
				var daysInCurrentMonth = (leap ? MONTH_DAYS_LEAP : MONTH_DAYS_REGULAR)[
					currentMonth
				];

				if (days > daysInCurrentMonth - newDate.getDate()) {
					// we spill over to next month
					days -= daysInCurrentMonth - newDate.getDate() + 1;
					newDate.setDate(1);
					if (currentMonth < 11) {
						newDate.setMonth(currentMonth + 1);
					} else {
						newDate.setMonth(0);
						newDate.setFullYear(newDate.getFullYear() + 1);
					}
				} else {
					// we stay in current month
					newDate.setDate(newDate.getDate() + days);
					return newDate;
				}
			}

			return newDate;
		};

		var _strptime = (buf, format, tm) => {
			// char *strptime(const char *restrict buf, const char *restrict format, struct tm *restrict tm);
			// http://pubs.opengroup.org/onlinepubs/009695399/functions/strptime.html
			var pattern = UTF8ToString(format);

			// escape special characters
			// TODO: not sure we really need to escape all of these in JS regexps
			var SPECIAL_CHARS = "\\!@#$^&*()+=-[]/{}|:<>?,.";
			for (var i = 0, ii = SPECIAL_CHARS.length; i < ii; ++i) {
				pattern = pattern.replace(
					new RegExp("\\" + SPECIAL_CHARS[i], "g"),
					"\\" + SPECIAL_CHARS[i],
				);
			}

			// reduce number of matchers
			var EQUIVALENT_MATCHERS = {
				A: "%a",
				B: "%b",
				c: "%a %b %d %H:%M:%S %Y",
				D: "%m\\/%d\\/%y",
				e: "%d",
				F: "%Y-%m-%d",
				h: "%b",
				R: "%H\\:%M",
				r: "%I\\:%M\\:%S\\s%p",
				T: "%H\\:%M\\:%S",
				x: "%m\\/%d\\/(?:%y|%Y)",
				X: "%H\\:%M\\:%S",
			};
			// TODO: take care of locale

			var DATE_PATTERNS = {
				/* weekday name */ a: "(?:Sun(?:day)?)|(?:Mon(?:day)?)|(?:Tue(?:sday)?)|(?:Wed(?:nesday)?)|(?:Thu(?:rsday)?)|(?:Fri(?:day)?)|(?:Sat(?:urday)?)",
				/* month name */ b: "(?:Jan(?:uary)?)|(?:Feb(?:ruary)?)|(?:Mar(?:ch)?)|(?:Apr(?:il)?)|May|(?:Jun(?:e)?)|(?:Jul(?:y)?)|(?:Aug(?:ust)?)|(?:Sep(?:tember)?)|(?:Oct(?:ober)?)|(?:Nov(?:ember)?)|(?:Dec(?:ember)?)",
				/* century */ C: "\\d\\d",
				/* day of month */ d: "0[1-9]|[1-9](?!\\d)|1\\d|2\\d|30|31",
				/* hour (24hr) */ H: "\\d(?!\\d)|[0,1]\\d|20|21|22|23",
				/* hour (12hr) */ I: "\\d(?!\\d)|0\\d|10|11|12",
				/* day of year */ j: "00[1-9]|0?[1-9](?!\\d)|0?[1-9]\\d(?!\\d)|[1,2]\\d\\d|3[0-6]\\d",
				/* month */ m: "0[1-9]|[1-9](?!\\d)|10|11|12",
				/* minutes */ M: "0\\d|\\d(?!\\d)|[1-5]\\d",
				/* whitespace */ n: " ",
				/* AM/PM */ p: "AM|am|PM|pm|A\\.M\\.|a\\.m\\.|P\\.M\\.|p\\.m\\.",
				/* seconds */ S: "0\\d|\\d(?!\\d)|[1-5]\\d|60",
				/* week number */ U: "0\\d|\\d(?!\\d)|[1-4]\\d|50|51|52|53",
				/* week number */ W: "0\\d|\\d(?!\\d)|[1-4]\\d|50|51|52|53",
				/* weekday number */ w: "[0-6]",
				/* 2-digit year */ y: "\\d\\d",
				/* 4-digit year */ Y: "\\d\\d\\d\\d",
				/* whitespace */ t: " ",
				/* time zone */ z: "Z|(?:[\\+\\-]\\d\\d:?(?:\\d\\d)?)",
			};

			var MONTH_NUMBERS = {
				JAN: 0,
				FEB: 1,
				MAR: 2,
				APR: 3,
				MAY: 4,
				JUN: 5,
				JUL: 6,
				AUG: 7,
				SEP: 8,
				OCT: 9,
				NOV: 10,
				DEC: 11,
			};
			var DAY_NUMBERS_SUN_FIRST = {
				SUN: 0,
				MON: 1,
				TUE: 2,
				WED: 3,
				THU: 4,
				FRI: 5,
				SAT: 6,
			};
			var DAY_NUMBERS_MON_FIRST = {
				MON: 0,
				TUE: 1,
				WED: 2,
				THU: 3,
				FRI: 4,
				SAT: 5,
				SUN: 6,
			};

			var capture = [];
			var pattern_out = pattern
				.replace(/%(.)/g, (m, c) => EQUIVALENT_MATCHERS[c] || m)
				.replace(/%(.)/g, (_, c) => {
					let pat = DATE_PATTERNS[c];
					if (pat) {
						capture.push(c);
						return `(${pat})`;
					} else {
						return c;
					}
				})
				.replace(
					// any number of space or tab characters match zero or more spaces
					/\s+/g,
					"\\s*",
				);

			var matches = new RegExp("^" + pattern_out, "i").exec(UTF8ToString(buf));

			function initDate() {
				function fixup(value, min, max) {
					return typeof value != "number" || isNaN(value)
						? min
						: value >= min
							? value <= max
								? value
								: max
							: min;
				}
				return {
					year: fixup(HEAP32[(tm + 20) >> 2] + 1900, 1970, 9999),
					month: fixup(HEAP32[(tm + 16) >> 2], 0, 11),
					day: fixup(HEAP32[(tm + 12) >> 2], 1, 31),
					hour: fixup(HEAP32[(tm + 8) >> 2], 0, 23),
					min: fixup(HEAP32[(tm + 4) >> 2], 0, 59),
					sec: fixup(HEAP32[tm >> 2], 0, 59),
					gmtoff: 0,
				};
			}

			if (matches) {
				var date = initDate();
				var value;

				var getMatch = (symbol) => {
					var pos = capture.indexOf(symbol);
					// check if symbol appears in regexp
					if (pos >= 0) {
						// return matched value or null (falsy!) for non-matches
						return matches[pos + 1];
					}
					return;
				};

				// seconds
				if ((value = getMatch("S"))) {
					date.sec = jstoi_q(value);
				}

				// minutes
				if ((value = getMatch("M"))) {
					date.min = jstoi_q(value);
				}

				// hours
				if ((value = getMatch("H"))) {
					// 24h clock
					date.hour = jstoi_q(value);
				} else if ((value = getMatch("I"))) {
					// AM/PM clock
					var hour = jstoi_q(value);
					if ((value = getMatch("p"))) {
						hour += value.toUpperCase()[0] === "P" ? 12 : 0;
					}
					date.hour = hour;
				}

				// year
				if ((value = getMatch("Y"))) {
					// parse from four-digit year
					date.year = jstoi_q(value);
				} else if ((value = getMatch("y"))) {
					// parse from two-digit year...
					var year = jstoi_q(value);
					if ((value = getMatch("C"))) {
						// ...and century
						year += jstoi_q(value) * 100;
					} else {
						// ...and rule-of-thumb
						year += year < 69 ? 2000 : 1900;
					}
					date.year = year;
				}

				// month
				if ((value = getMatch("m"))) {
					// parse from month number
					date.month = jstoi_q(value) - 1;
				} else if ((value = getMatch("b"))) {
					// parse from month name
					date.month = MONTH_NUMBERS[value.substring(0, 3).toUpperCase()] || 0;
					// TODO: derive month from day in year+year, week number+day of week+year
				}

				// day
				if ((value = getMatch("d"))) {
					// get day of month directly
					date.day = jstoi_q(value);
				} else if ((value = getMatch("j"))) {
					// get day of month from day of year ...
					var day = jstoi_q(value);
					var leapYear = isLeapYear(date.year);
					for (var month = 0; month < 12; ++month) {
						var daysUntilMonth = arraySum(
							leapYear ? MONTH_DAYS_LEAP : MONTH_DAYS_REGULAR,
							month - 1,
						);
						if (
							day <=
							daysUntilMonth +
								(leapYear ? MONTH_DAYS_LEAP : MONTH_DAYS_REGULAR)[month]
						) {
							date.day = day - daysUntilMonth;
						}
					}
				} else if ((value = getMatch("a"))) {
					// get day of month from weekday ...
					var weekDay = value.substring(0, 3).toUpperCase();
					if ((value = getMatch("U"))) {
						// ... and week number (Sunday being first day of week)
						// Week number of the year (Sunday as the first day of the week) as a decimal number [00,53].
						// All days in a new year preceding the first Sunday are considered to be in week 0.
						var weekDayNumber = DAY_NUMBERS_SUN_FIRST[weekDay];
						var weekNumber = jstoi_q(value);

						// January 1st
						var janFirst = new Date(date.year, 0, 1);
						var endDate;
						if (janFirst.getDay() === 0) {
							// Jan 1st is a Sunday, and, hence in the 1st CW
							endDate = addDays(janFirst, weekDayNumber + 7 * (weekNumber - 1));
						} else {
							// Jan 1st is not a Sunday, and, hence still in the 0th CW
							endDate = addDays(
								janFirst,
								7 - janFirst.getDay() + weekDayNumber + 7 * (weekNumber - 1),
							);
						}
						date.day = endDate.getDate();
						date.month = endDate.getMonth();
					} else if ((value = getMatch("W"))) {
						// ... and week number (Monday being first day of week)
						// Week number of the year (Monday as the first day of the week) as a decimal number [00,53].
						// All days in a new year preceding the first Monday are considered to be in week 0.
						var weekDayNumber = DAY_NUMBERS_MON_FIRST[weekDay];
						var weekNumber = jstoi_q(value);

						// January 1st
						var janFirst = new Date(date.year, 0, 1);
						var endDate;
						if (janFirst.getDay() === 1) {
							// Jan 1st is a Monday, and, hence in the 1st CW
							endDate = addDays(janFirst, weekDayNumber + 7 * (weekNumber - 1));
						} else {
							// Jan 1st is not a Monday, and, hence still in the 0th CW
							endDate = addDays(
								janFirst,
								7 -
									janFirst.getDay() +
									1 +
									weekDayNumber +
									7 * (weekNumber - 1),
							);
						}

						date.day = endDate.getDate();
						date.month = endDate.getMonth();
					}
				}

				// time zone
				if ((value = getMatch("z"))) {
					// GMT offset as either 'Z' or +-HH:MM or +-HH or +-HHMM
					if (value.toLowerCase() === "z") {
						date.gmtoff = 0;
					} else {
						var match = value.match(/^((?:\-|\+)\d\d):?(\d\d)?/);
						date.gmtoff = match[1] * 3600;
						if (match[2]) {
							date.gmtoff += date.gmtoff > 0 ? match[2] * 60 : -match[2] * 60;
						}
					}
				}

				/*
        tm_sec  int seconds after the minute  0-61*
        tm_min  int minutes after the hour  0-59
        tm_hour int hours since midnight  0-23
        tm_mday int day of the month  1-31
        tm_mon  int months since January  0-11
        tm_year int years since 1900
        tm_wday int days since Sunday 0-6
        tm_yday int days since January 1  0-365
        tm_isdst  int Daylight Saving Time flag
        tm_gmtoff long offset from GMT (seconds)
        */

				var fullDate = new Date(
					date.year,
					date.month,
					date.day,
					date.hour,
					date.min,
					date.sec,
					0,
				);
				HEAP32[tm >> 2] = fullDate.getSeconds();
				HEAP32[(tm + 4) >> 2] = fullDate.getMinutes();
				HEAP32[(tm + 8) >> 2] = fullDate.getHours();
				HEAP32[(tm + 12) >> 2] = fullDate.getDate();
				HEAP32[(tm + 16) >> 2] = fullDate.getMonth();
				HEAP32[(tm + 20) >> 2] = fullDate.getFullYear() - 1900;
				HEAP32[(tm + 24) >> 2] = fullDate.getDay();
				HEAP32[(tm + 28) >> 2] =
					arraySum(
						isLeapYear(fullDate.getFullYear())
							? MONTH_DAYS_LEAP
							: MONTH_DAYS_REGULAR,
						fullDate.getMonth() - 1,
					) +
					fullDate.getDate() -
					1;
				HEAP32[(tm + 32) >> 2] = 0;
				HEAP32[(tm + 36) >> 2] = date.gmtoff;

				// we need to convert the matched sequence into an integer array to take care of UTF-8 characters > 0x7F
				// TODO: not sure that intArrayFromString handles all unicode characters correctly
				return buf + intArrayFromString(matches[0]).length - 1;
			}

			return 0;
		};

		/** @type {function(...*):?} */
		function _swapcontext() {
			abort("missing function: swapcontext");
		}
		_swapcontext.stub = true;

		var getCFunc = (ident) => {
			var func = Module["_" + ident]; // closure exported function
			assert(
				func,
				"Cannot call unknown function " + ident + ", make sure it is exported",
			);
			return func;
		};

		var writeArrayToMemory = (array, buffer) => {
			assert(
				array.length >= 0,
				"writeArrayToMemory array must have a length (should be an array or typed array)",
			);
			HEAP8.set(array, buffer);
		};

		var stackAlloc = (sz) => __emscripten_stack_alloc(sz);
		var stringToUTF8OnStack = (str) => {
			var size = lengthBytesUTF8(str) + 1;
			var ret = stackAlloc(size);
			stringToUTF8(str, ret, size);
			return ret;
		};

		/**
		 * @param {string|null=} returnType
		 * @param {Array=} argTypes
		 * @param {Arguments|Array=} args
		 * @param {Object=} opts
		 */
		var ccall = (ident, returnType, argTypes, args, opts) => {
			// For fast lookup of conversion functions
			var toC = {
				string: (str) => {
					var ret = 0;
					if (str !== null && str !== undefined && str !== 0) {
						// null string
						ret = stringToUTF8OnStack(str);
					}
					return ret;
				},
				array: (arr) => {
					var ret = stackAlloc(arr.length);
					writeArrayToMemory(arr, ret);
					return ret;
				},
			};

			function convertReturnValue(ret) {
				if (returnType === "string") {
					return UTF8ToString(ret);
				}
				if (returnType === "boolean") return Boolean(ret);
				return ret;
			}

			var func = getCFunc(ident);
			var cArgs = [];
			var stack = 0;
			assert(returnType !== "array", 'Return type should not be "array".');
			if (args) {
				for (var i = 0; i < args.length; i++) {
					var converter = toC[argTypes[i]];
					if (converter) {
						if (stack === 0) stack = stackSave();
						cArgs[i] = converter(args[i]);
					} else {
						cArgs[i] = args[i];
					}
				}
			}
			var ret = func(...cArgs);
			function onDone(ret) {
				if (stack !== 0) stackRestore(stack);
				return convertReturnValue(ret);
			}

			ret = onDone(ret);
			return ret;
		};

		FS.createPreloadedFile = FS_createPreloadedFile;
		FS.staticInit();
		// Set module methods based on EXPORTED_RUNTIME_METHODS
		function checkIncomingModuleAPI() {
			ignoredModuleProp("fetchSettings");
		}
		var wasmImports = {
			/** @export */
			__assert_fail: ___assert_fail,
			/** @export */
			__call_sighandler: ___call_sighandler,
			/** @export */
			__syscall__newselect: ___syscall__newselect,
			/** @export */
			__syscall_accept4: ___syscall_accept4,
			/** @export */
			__syscall_bind: ___syscall_bind,
			/** @export */
			__syscall_chdir: ___syscall_chdir,
			/** @export */
			__syscall_chmod: ___syscall_chmod,
			/** @export */
			__syscall_connect: ___syscall_connect,
			/** @export */
			__syscall_dup: ___syscall_dup,
			/** @export */
			__syscall_faccessat: ___syscall_faccessat,
			/** @export */
			__syscall_fchownat: ___syscall_fchownat,
			/** @export */
			__syscall_fcntl64: ___syscall_fcntl64,
			/** @export */
			__syscall_fdatasync: ___syscall_fdatasync,
			/** @export */
			__syscall_fstat64: ___syscall_fstat64,
			/** @export */
			__syscall_ftruncate64: ___syscall_ftruncate64,
			/** @export */
			__syscall_getcwd: ___syscall_getcwd,
			/** @export */
			__syscall_getdents64: ___syscall_getdents64,
			/** @export */
			__syscall_getpeername: ___syscall_getpeername,
			/** @export */
			__syscall_getsockname: ___syscall_getsockname,
			/** @export */
			__syscall_getsockopt: ___syscall_getsockopt,
			/** @export */
			__syscall_ioctl: ___syscall_ioctl,
			/** @export */
			__syscall_listen: ___syscall_listen,
			/** @export */
			__syscall_lstat64: ___syscall_lstat64,
			/** @export */
			__syscall_mkdirat: ___syscall_mkdirat,
			/** @export */
			__syscall_newfstatat: ___syscall_newfstatat,
			/** @export */
			__syscall_openat: ___syscall_openat,
			/** @export */
			__syscall_pipe: ___syscall_pipe,
			/** @export */
			__syscall_poll: ___syscall_poll,
			/** @export */
			__syscall_readlinkat: ___syscall_readlinkat,
			/** @export */
			__syscall_recvfrom: ___syscall_recvfrom,
			/** @export */
			__syscall_renameat: ___syscall_renameat,
			/** @export */
			__syscall_rmdir: ___syscall_rmdir,
			/** @export */
			__syscall_sendto: ___syscall_sendto,
			/** @export */
			__syscall_socket: ___syscall_socket,
			/** @export */
			__syscall_stat64: ___syscall_stat64,
			/** @export */
			__syscall_statfs64: ___syscall_statfs64,
			/** @export */
			__syscall_symlinkat: ___syscall_symlinkat,
			/** @export */
			__syscall_unlinkat: ___syscall_unlinkat,
			/** @export */
			__syscall_utimensat: ___syscall_utimensat,
			/** @export */
			_abort_js: __abort_js,
			/** @export */
			_emscripten_lookup_name: __emscripten_lookup_name,
			/** @export */
			_emscripten_memcpy_js: __emscripten_memcpy_js,
			/** @export */
			_emscripten_runtime_keepalive_clear: __emscripten_runtime_keepalive_clear,
			/** @export */
			_emscripten_throw_longjmp: __emscripten_throw_longjmp,
			/** @export */
			_gmtime_js: __gmtime_js,
			/** @export */
			_localtime_js: __localtime_js,
			/** @export */
			_mktime_js: __mktime_js,
			/** @export */
			_mmap_js: __mmap_js,
			/** @export */
			_munmap_js: __munmap_js,
			/** @export */
			_setitimer_js: __setitimer_js,
			/** @export */
			_tzset_js: __tzset_js,
			/** @export */
			clock_time_get: _clock_time_get,
			/** @export */
			emscripten_date_now: _emscripten_date_now,
			/** @export */
			emscripten_err: _emscripten_err,
			/** @export */
			emscripten_get_heap_max: _emscripten_get_heap_max,
			/** @export */
			emscripten_get_now: _emscripten_get_now,
			/** @export */
			emscripten_resize_heap: _emscripten_resize_heap,
			/** @export */
			environ_get: _environ_get,
			/** @export */
			environ_sizes_get: _environ_sizes_get,
			/** @export */
			exit: _exit,
			/** @export */
			fd_close: _fd_close,
			/** @export */
			fd_fdstat_get: _fd_fdstat_get,
			/** @export */
			fd_read: _fd_read,
			/** @export */
			fd_seek: _fd_seek,
			/** @export */
			fd_sync: _fd_sync,
			/** @export */
			fd_write: _fd_write,
			/** @export */
			getaddrinfo: _getaddrinfo,
			/** @export */
			getcontext: _getcontext,
			/** @export */
			getdtablesize: _getdtablesize,
			/** @export */
			getnameinfo: _getnameinfo,
			/** @export */
			getprotobyname: _getprotobyname,
			/** @export */
			getprotobynumber: _getprotobynumber,
			/** @export */
			invoke_i,
			/** @export */
			invoke_ii,
			/** @export */
			invoke_iii,
			/** @export */
			invoke_iiii,
			/** @export */
			invoke_iiiii,
			/** @export */
			invoke_iiiiii,
			/** @export */
			invoke_iiiiiii,
			/** @export */
			invoke_iiiiiiiiii,
			/** @export */
			invoke_v,
			/** @export */
			invoke_vi,
			/** @export */
			invoke_vii,
			/** @export */
			invoke_viidii,
			/** @export */
			invoke_viii,
			/** @export */
			invoke_viiii,
			/** @export */
			invoke_viiiii,
			/** @export */
			makecontext: _makecontext,
			/** @export */
			posix_spawnp: _posix_spawnp,
			/** @export */
			proc_exit: _proc_exit,
			/** @export */
			strptime: _strptime,
			/** @export */
			swapcontext: _swapcontext,
		};
		var wasmExports;
		createWasm();
		var ___wasm_call_ctors = createExportWrapper("__wasm_call_ctors", 0);
		var _php_wasm_run = (Module["_php_wasm_run"] = createExportWrapper(
			"php_wasm_run",
			1,
		));
		var _fflush = createExportWrapper("fflush", 1);
		var _malloc = createExportWrapper("malloc", 1);
		var _strerror = createExportWrapper("strerror", 1);
		var _htons = createExportWrapper("htons", 1);
		var _ntohs = createExportWrapper("ntohs", 1);
		var _htonl = createExportWrapper("htonl", 1);
		var _emscripten_builtin_memalign = createExportWrapper(
			"emscripten_builtin_memalign",
			2,
		);
		var __emscripten_timeout = createExportWrapper("_emscripten_timeout", 2);
		var _setThrew = createExportWrapper("setThrew", 2);
		var __emscripten_tempret_set = createExportWrapper(
			"_emscripten_tempret_set",
			1,
		);
		var _emscripten_stack_init = () =>
			(_emscripten_stack_init = wasmExports["emscripten_stack_init"])();
		var _emscripten_stack_get_free = () =>
			(_emscripten_stack_get_free = wasmExports["emscripten_stack_get_free"])();
		var _emscripten_stack_get_base = () =>
			(_emscripten_stack_get_base = wasmExports["emscripten_stack_get_base"])();
		var _emscripten_stack_get_end = () =>
			(_emscripten_stack_get_end = wasmExports["emscripten_stack_get_end"])();
		var __emscripten_stack_restore = (a0) =>
			(__emscripten_stack_restore = wasmExports["_emscripten_stack_restore"])(
				a0,
			);
		var __emscripten_stack_alloc = (a0) =>
			(__emscripten_stack_alloc = wasmExports["_emscripten_stack_alloc"])(a0);
		var _emscripten_stack_get_current = () =>
			(_emscripten_stack_get_current =
				wasmExports["emscripten_stack_get_current"])();
		var dynCall_jiji = (Module["dynCall_jiji"] = createExportWrapper(
			"dynCall_jiji",
			5,
		));

		function invoke_iii(index, a1, a2) {
			var sp = stackSave();
			try {
				return getWasmTableEntry(index)(a1, a2);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}

		function invoke_iiiii(index, a1, a2, a3, a4) {
			var sp = stackSave();
			try {
				return getWasmTableEntry(index)(a1, a2, a3, a4);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}

		function invoke_v(index) {
			var sp = stackSave();
			try {
				getWasmTableEntry(index)();
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}

		function invoke_ii(index, a1) {
			var sp = stackSave();
			try {
				return getWasmTableEntry(index)(a1);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}

		function invoke_viii(index, a1, a2, a3) {
			var sp = stackSave();
			try {
				getWasmTableEntry(index)(a1, a2, a3);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}

		function invoke_vii(index, a1, a2) {
			var sp = stackSave();
			try {
				getWasmTableEntry(index)(a1, a2);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}

		function invoke_vi(index, a1) {
			var sp = stackSave();
			try {
				getWasmTableEntry(index)(a1);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}

		function invoke_i(index) {
			var sp = stackSave();
			try {
				return getWasmTableEntry(index)();
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}

		function invoke_iiiiiii(index, a1, a2, a3, a4, a5, a6) {
			var sp = stackSave();
			try {
				return getWasmTableEntry(index)(a1, a2, a3, a4, a5, a6);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}

		function invoke_iiii(index, a1, a2, a3) {
			var sp = stackSave();
			try {
				return getWasmTableEntry(index)(a1, a2, a3);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}

		function invoke_viiii(index, a1, a2, a3, a4) {
			var sp = stackSave();
			try {
				getWasmTableEntry(index)(a1, a2, a3, a4);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}

		function invoke_viiiii(index, a1, a2, a3, a4, a5) {
			var sp = stackSave();
			try {
				getWasmTableEntry(index)(a1, a2, a3, a4, a5);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}

		function invoke_iiiiii(index, a1, a2, a3, a4, a5) {
			var sp = stackSave();
			try {
				return getWasmTableEntry(index)(a1, a2, a3, a4, a5);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}

		function invoke_iiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
			var sp = stackSave();
			try {
				return getWasmTableEntry(index)(a1, a2, a3, a4, a5, a6, a7, a8, a9);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}

		function invoke_viidii(index, a1, a2, a3, a4, a5) {
			var sp = stackSave();
			try {
				getWasmTableEntry(index)(a1, a2, a3, a4, a5);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}

		// include: postamble.js
		// === Auto-generated postamble setup entry stuff ===

		Module["ccall"] = ccall;
		var missingLibrarySymbols = [
			"writeI53ToI64",
			"writeI53ToI64Clamped",
			"writeI53ToI64Signaling",
			"writeI53ToU64Clamped",
			"writeI53ToU64Signaling",
			"readI53FromU64",
			"convertI32PairToI53",
			"convertU32PairToI53",
			"getTempRet0",
			"growMemory",
			"emscriptenLog",
			"readEmAsmArgs",
			"listenOnce",
			"autoResumeAudioContext",
			"dynCallLegacy",
			"getDynCaller",
			"dynCall",
			"runtimeKeepalivePush",
			"runtimeKeepalivePop",
			"asmjsMangle",
			"HandleAllocator",
			"getNativeTypeSize",
			"STACK_SIZE",
			"STACK_ALIGN",
			"POINTER_SIZE",
			"ASSERTIONS",
			"cwrap",
			"uleb128Encode",
			"sigToWasmTypes",
			"generateFuncType",
			"convertJsFunctionToWasm",
			"getEmptyTableSlot",
			"updateTableMap",
			"getFunctionAddress",
			"addFunction",
			"removeFunction",
			"reallyNegative",
			"unSign",
			"strLen",
			"reSign",
			"formatString",
			"intArrayToString",
			"AsciiToString",
			"UTF16ToString",
			"stringToUTF16",
			"lengthBytesUTF16",
			"UTF32ToString",
			"stringToUTF32",
			"lengthBytesUTF32",
			"stringToNewUTF8",
			"registerKeyEventCallback",
			"maybeCStringToJsString",
			"findEventTarget",
			"getBoundingClientRect",
			"fillMouseEventData",
			"registerMouseEventCallback",
			"registerWheelEventCallback",
			"registerUiEventCallback",
			"registerFocusEventCallback",
			"fillDeviceOrientationEventData",
			"registerDeviceOrientationEventCallback",
			"fillDeviceMotionEventData",
			"registerDeviceMotionEventCallback",
			"screenOrientation",
			"fillOrientationChangeEventData",
			"registerOrientationChangeEventCallback",
			"fillFullscreenChangeEventData",
			"registerFullscreenChangeEventCallback",
			"JSEvents_requestFullscreen",
			"JSEvents_resizeCanvasForFullscreen",
			"registerRestoreOldStyle",
			"hideEverythingExceptGivenElement",
			"restoreHiddenElements",
			"setLetterbox",
			"softFullscreenResizeWebGLRenderTarget",
			"doRequestFullscreen",
			"fillPointerlockChangeEventData",
			"registerPointerlockChangeEventCallback",
			"registerPointerlockErrorEventCallback",
			"requestPointerLock",
			"fillVisibilityChangeEventData",
			"registerVisibilityChangeEventCallback",
			"registerTouchEventCallback",
			"fillGamepadEventData",
			"registerGamepadEventCallback",
			"registerBeforeUnloadEventCallback",
			"fillBatteryEventData",
			"battery",
			"registerBatteryEventCallback",
			"setCanvasElementSize",
			"getCanvasElementSize",
			"jsStackTrace",
			"getCallstack",
			"convertPCtoSourceLocation",
			"wasiRightsToMuslOFlags",
			"wasiOFlagsToMuslOFlags",
			"safeSetTimeout",
			"setImmediateWrapped",
			"safeRequestAnimationFrame",
			"clearImmediateWrapped",
			"polyfillSetImmediate",
			"registerPostMainLoop",
			"registerPreMainLoop",
			"getPromise",
			"makePromise",
			"idsToPromises",
			"makePromiseCallback",
			"ExceptionInfo",
			"findMatchingCatch",
			"Browser_asyncPrepareDataCounter",
			"FS_unlink",
			"FS_mkdirTree",
			"_setNetworkCallback",
			"heapObjectForWebGLType",
			"toTypedArrayIndex",
			"webgl_enable_ANGLE_instanced_arrays",
			"webgl_enable_OES_vertex_array_object",
			"webgl_enable_WEBGL_draw_buffers",
			"webgl_enable_WEBGL_multi_draw",
			"webgl_enable_EXT_polygon_offset_clamp",
			"webgl_enable_EXT_clip_control",
			"webgl_enable_WEBGL_polygon_mode",
			"emscriptenWebGLGet",
			"computeUnpackAlignedImageSize",
			"colorChannelsInGlTextureFormat",
			"emscriptenWebGLGetTexPixelData",
			"emscriptenWebGLGetUniform",
			"webglGetUniformLocation",
			"webglPrepareUniformLocationsBeforeFirstUse",
			"webglGetLeftBracePos",
			"emscriptenWebGLGetVertexAttrib",
			"__glGetActiveAttribOrUniform",
			"writeGLArray",
			"registerWebGlEventCallback",
			"runAndAbortIfError",
			"ALLOC_NORMAL",
			"ALLOC_STACK",
			"allocate",
			"writeStringToMemory",
			"writeAsciiToMemory",
			"setErrNo",
			"demangle",
			"stackTrace",
		];
		missingLibrarySymbols.forEach(missingLibrarySymbol);

		var unexportedSymbols = [
			"run",
			"addOnPreRun",
			"addOnInit",
			"addOnPreMain",
			"addOnExit",
			"addOnPostRun",
			"addRunDependency",
			"removeRunDependency",
			"out",
			"err",
			"callMain",
			"abort",
			"wasmMemory",
			"wasmExports",
			"writeStackCookie",
			"checkStackCookie",
			"readI53FromI64",
			"convertI32PairToI53Checked",
			"stackSave",
			"stackRestore",
			"stackAlloc",
			"setTempRet0",
			"ptrToString",
			"zeroMemory",
			"exitJS",
			"getHeapMax",
			"abortOnCannotGrowMemory",
			"ENV",
			"ERRNO_CODES",
			"strError",
			"inetPton4",
			"inetNtop4",
			"inetPton6",
			"inetNtop6",
			"readSockaddr",
			"writeSockaddr",
			"DNS",
			"Protocols",
			"Sockets",
			"timers",
			"warnOnce",
			"readEmAsmArgsArray",
			"jstoi_q",
			"jstoi_s",
			"getExecutableName",
			"handleException",
			"keepRuntimeAlive",
			"callUserCallback",
			"maybeExit",
			"asyncLoad",
			"alignMemory",
			"mmapAlloc",
			"wasmTable",
			"noExitRuntime",
			"getCFunc",
			"freeTableIndexes",
			"functionsInTableMap",
			"setValue",
			"getValue",
			"PATH",
			"PATH_FS",
			"UTF8Decoder",
			"UTF8ArrayToString",
			"UTF8ToString",
			"stringToUTF8Array",
			"stringToUTF8",
			"lengthBytesUTF8",
			"intArrayFromString",
			"stringToAscii",
			"UTF16Decoder",
			"stringToUTF8OnStack",
			"writeArrayToMemory",
			"JSEvents",
			"specialHTMLTargets",
			"findCanvasEventTarget",
			"currentFullscreenStrategy",
			"restoreOldWindowedStyle",
			"UNWIND_CACHE",
			"ExitStatus",
			"getEnvStrings",
			"checkWasiClock",
			"doReadv",
			"doWritev",
			"initRandomFill",
			"randomFill",
			"promiseMap",
			"uncaughtExceptionCount",
			"exceptionLast",
			"exceptionCaught",
			"Browser",
			"getPreloadedImageData__data",
			"wget",
			"MONTH_DAYS_REGULAR",
			"MONTH_DAYS_LEAP",
			"MONTH_DAYS_REGULAR_CUMULATIVE",
			"MONTH_DAYS_LEAP_CUMULATIVE",
			"isLeapYear",
			"ydayFromDate",
			"arraySum",
			"addDays",
			"SYSCALLS",
			"getSocketFromFD",
			"getSocketAddress",
			"preloadPlugins",
			"FS_createPreloadedFile",
			"FS_modeStringToFlags",
			"FS_getMode",
			"FS_stdin_getChar_buffer",
			"FS_stdin_getChar",
			"FS_createPath",
			"FS_createDevice",
			"FS_readFile",
			"FS",
			"FS_createDataFile",
			"FS_createLazyFile",
			"MEMFS",
			"TTY",
			"PIPEFS",
			"SOCKFS",
			"tempFixedLengthArray",
			"miniTempWebGLFloatBuffers",
			"miniTempWebGLIntBuffers",
			"GL",
			"AL",
			"GLUT",
			"EGL",
			"GLEW",
			"IDBStore",
			"SDL",
			"SDL_gfx",
			"allocateUTF8",
			"allocateUTF8OnStack",
			"print",
			"printErr",
		];
		unexportedSymbols.forEach(unexportedRuntimeSymbol);

		var calledRun;

		dependenciesFulfilled = function runCaller() {
			// If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
			if (!calledRun) run();
			if (!calledRun) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
		};

		function stackCheckInit() {
			// This is normally called automatically during __wasm_call_ctors but need to
			// get these values before even running any of the ctors so we call it redundantly
			// here.
			_emscripten_stack_init();
			// TODO(sbc): Move writeStackCookie to native to to avoid this.
			writeStackCookie();
		}

		function run() {
			if (runDependencies > 0) {
				return;
			}

			stackCheckInit();

			preRun();

			// a preRun added a dependency, run will be called later
			if (runDependencies > 0) {
				return;
			}

			function doRun() {
				// run may have just been called through dependencies being fulfilled just in this very frame,
				// or while the async setStatus time below was happening
				if (calledRun) return;
				calledRun = true;
				Module["calledRun"] = true;

				if (ABORT) return;

				initRuntime();

				readyPromiseResolve(Module);
				Module["onRuntimeInitialized"]?.();

				assert(
					!Module["_main"],
					'compiled without a main, but one is present. if you added it from JS, use Module["onRuntimeInitialized"]',
				);

				postRun();
			}

			if (Module["setStatus"]) {
				Module["setStatus"]("Running...");
				setTimeout(() => {
					setTimeout(() => Module["setStatus"](""), 1);
					doRun();
				}, 1);
			} else {
				doRun();
			}
			checkStackCookie();
		}

		function checkUnflushedContent() {
			// Compiler settings do not allow exiting the runtime, so flushing
			// the streams is not possible. but in ASSERTIONS mode we check
			// if there was something to flush, and if so tell the user they
			// should request that the runtime be exitable.
			// Normally we would not even include flush() at all, but in ASSERTIONS
			// builds we do so just for this check, and here we see if there is any
			// content to flush, that is, we check if there would have been
			// something a non-ASSERTIONS build would have not seen.
			// How we flush the streams depends on whether we are in SYSCALLS_REQUIRE_FILESYSTEM=0
			// mode (which has its own special function for this; otherwise, all
			// the code is inside libc)
			var oldOut = out;
			var oldErr = err;
			var has = false;
			out = err = (x) => {
				has = true;
			};
			try {
				// it doesn't matter if it fails
				_fflush(0);
				// also flush in the JS FS layer
				["stdout", "stderr"].forEach((name) => {
					var info = FS.analyzePath("/dev/" + name);
					if (!info) return;
					var stream = info.object;
					var rdev = stream.rdev;
					var tty = TTY.ttys[rdev];
					if (tty?.output?.length) {
						has = true;
					}
				});
			} catch (e) {}
			out = oldOut;
			err = oldErr;
			if (has) {
				warnOnce(
					"stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the Emscripten FAQ), or make sure to emit a newline when you printf etc.",
				);
			}
		}

		if (Module["preInit"]) {
			if (typeof Module["preInit"] == "function")
				Module["preInit"] = [Module["preInit"]];
			while (Module["preInit"].length > 0) {
				Module["preInit"].pop()();
			}
		}

		run();

		// end include: postamble.js

		// include: postamble_modularize.js
		// In MODULARIZE mode we wrap the generated code in a factory function
		// and return either the Module itself, or a promise of the module.
		//
		// We assign to the `moduleRtn` global here and configure closure to see
		// this as and extern so it won't get minified.

		moduleRtn = readyPromise;

		// Assertion for attempting to access module properties on the incoming
		// moduleArg.  In the past we used this object as the prototype of the module
		// and assigned properties to it, but now we return a distinct object.  This
		// keeps the instance private until it is ready (i.e the promise has been
		// resolved).
		for (const prop of Object.keys(Module)) {
			if (!(prop in moduleArg)) {
				Object.defineProperty(moduleArg, prop, {
					configurable: true,
					get() {
						abort(
							`Access to module property ('${prop}') is no longer possible via the module constructor argument; Instead, use the result of the module constructor.`,
						);
					},
				});
			}
		}
		// end include: postamble_modularize.js

		return moduleRtn;
	};
})();
export default Module;
