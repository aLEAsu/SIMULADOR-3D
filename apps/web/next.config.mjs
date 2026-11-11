/** @type {import('next').NextConfig} */
export default (phase) => ({
	distDir: phase === "phase-development-server" ? ".next-dev" : ".next",
});
