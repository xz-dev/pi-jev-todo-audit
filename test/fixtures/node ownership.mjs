/** Native Node smoke: real production gate, no shell or copied ownership algorithm. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { claimAuditProcess, OWNER_PID_ENV } from "../../ownership.ts";

const role = process.argv[2] ?? "parent";
const inherited = process.env[OWNER_PID_ENV];
const allowed = claimAuditProcess();
const reload = claimAuditProcess();
assert.equal(reload, allowed);
if (role === "parent") {
	assert.equal(inherited, undefined);
	assert.equal(allowed, true);
	assert.equal(process.env[OWNER_PID_ENV], String(process.pid));
} else {
	assert.equal(allowed, false);
	assert.equal(process.env[OWNER_PID_ENV], inherited);
}
let child;
if (role !== "grandchild") {
	const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), role === "parent" ? "child" : "grandchild"], {
		encoding: "utf8", shell: false, timeout: 10000,
	});
	assert.equal(result.status, 0, result.stderr || result.error?.message);
	child = JSON.parse(result.stdout);
	assert.equal(child.owner, process.env[OWNER_PID_ENV]);
	assert.equal(child.allowed, false);
}
console.log(JSON.stringify({ runtime: process.release.name, version: process.version, role, pid: process.pid,
	owner: process.env[OWNER_PID_ENV], allowed, reload, child }));
