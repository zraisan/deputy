const files: Record<string, string> = { '/': 'examples/intake.html', '/booking': 'examples/booking.html', '/spa': 'examples/spa.html', '/aria': 'examples/aria-form.html', '/intake': 'examples/intake.html', '/copilot': 'examples/copilotkit.html' };
Bun.serve({
  port: 8877, hostname: '127.0.0.1',
  fetch: (req) => {
    const p = new URL(req.url).pathname;
    if (p === '/api/copilotkit') return Response.json({ ok: true });
    return new Response(Bun.file(files[p] ?? files['/']!), { headers: { 'content-type': 'text/html' } });
  },
});
console.log('demo on http://127.0.0.1:8877  (/ = form, /spa = no-form app)');
