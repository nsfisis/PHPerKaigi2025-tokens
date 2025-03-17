import phpWasmBridgeUrl from "./php-wasm-bridge.js?url";

export type PHPExecResult = {
	success: boolean;
	stdout: string;
	stderr: string;
};

const BUFFER_MAX = 1024;

let fetchingWasmBinaryPromise: Promise<ArrayBuffer> | null = null;

// Fetching is performed only once.
async function fetchWasmBinary(): Promise<ArrayBuffer> {
	if (!fetchingWasmBinaryPromise) {
		fetchingWasmBinaryPromise = new Promise((resolve, reject) => {
			fetch(import.meta.env.BASE_URL + "/php-wasm.wasm")
				.then((res) => {
					if (!res.ok) {
						reject(`Failed to fetch wasm binary: ${res.status} (${res.url})`);
					}
					return res;
				})
				.then((res) => res.arrayBuffer())
				.then((buf) => resolve(buf));
		});
	}
	return fetchingWasmBinaryPromise;
}

export async function execPHP(code: string): Promise<PHPExecResult> {
	let stdinPos = 0; // bytewise
	const stdinBuf = new TextEncoder().encode(code);
	let stdoutPos = 0; // bytewise
	const stdoutBuf = new Uint8Array(BUFFER_MAX);
	let stderrPos = 0; // bytewise
	const stderrBuf = new Uint8Array(BUFFER_MAX);

	const { default: PHPWasm } = await import(
		/* @vite-ignore */ phpWasmBridgeUrl
	);
	const { ccall } = await PHPWasm({
		wasmBinary: await fetchWasmBinary(),
		stdin: () => {
			if (stdinBuf.length <= stdinPos) {
				return null;
			}
			return stdinBuf[stdinPos++];
		},
		stdout: (asciiCode: number | null) => {
			if (asciiCode === null) {
				return; // flush
			}
			if (BUFFER_MAX <= stdoutPos) {
				return; // ignore
			}
			if (asciiCode < 0) {
				asciiCode += 256;
			}
			stdoutBuf[stdoutPos++] = asciiCode;
		},
		stderr: (asciiCode: number | null) => {
			if (asciiCode === null) {
				return; // flush
			}
			if (BUFFER_MAX <= stderrPos) {
				return; // ignore
			}
			if (asciiCode < 0) {
				asciiCode += 256;
			}
			stderrBuf[stderrPos++] = asciiCode;
		},
	});

	let result;
	let extraError = null;
	try {
		result = ccall("php_wasm_run", "number", ["string"], [code]);
	} catch (e) {
		if (e instanceof WebAssembly.RuntimeError) {
			extraError = e.message;
		} else {
			throw e;
		}
	}
	const stdout = new TextDecoder().decode(stdoutBuf.subarray(0, stdoutPos));
	const stderr = new TextDecoder().decode(stderrBuf.subarray(0, stderrPos));

	return {
		success: result === 0,
		stdout,
		stderr: extraError == null ? stderr : `${stderr}\n${extraError}`,
	};
}
