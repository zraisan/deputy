const files: Record<string, string> = { '/': 'bench/demo/booking.html', '/spa': 'bench/demo/spa.html', '/aria': 'bench/demo/aria-form.html' };
Bun.serve({
  port: 8877, hostname: '127.0.0.1',
  fetch: (req) => {
    const p = new URL(req.url).pathname;
    return new Response(Bun.file(files[p] ?? files['/']!), { headers: { 'content-type': 'text/html' } });
  },
});
console.log('demo on http://127.0.0.1:8877  (/ = form, /spa = no-form app)');
