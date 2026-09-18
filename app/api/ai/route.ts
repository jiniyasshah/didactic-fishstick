const REPLICATE = 'https://api.replicate.com/v1';
function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } }); }
function key(req: Request, provider: string) { const value = req.headers.get(`x-${provider}-key`); if (!value || value.length > 500 || /[\r\n]/.test(value))
    throw new Error(`Connect your ${provider === 'openai' ? 'OpenAI' : 'Replicate'} API key first.`); return value; }
async function checked(response: Response) { const data = await response.json() as Record<string, any>; if (!response.ok)
    throw new Error(data.error?.message || data.detail || `The AI provider returned ${response.status}. Check your API key and account balance.`); return data; }
function sameOrigin(req: Request) { const origin = req.headers.get('origin'); if (origin && origin !== new URL(req.url).origin)
    throw new Error('Cross-origin processing requests are not allowed.'); }
export async function POST(req: Request) {
    try {
        sameOrigin(req);
        const action = new URL(req.url).searchParams.get('action');
        if (action === 'transcribe') {
            const token = key(req, 'openai');
            if (Number(req.headers.get('content-length')) > 25 * 1024 * 1024)
                return json({ error: 'Audio must be smaller than 24 MB.' }, 413);
            const incoming = await req.formData();
            const file = incoming.get('file');
            if (!(file instanceof File) || file.size > 24 * 1024 * 1024)
                return json({ error: 'Choose an audio file under 24 MB.' }, 400);
            const form = new FormData();
            form.append('file', file, 'vocals.wav');
            form.append('model', 'whisper-1');
            form.append('response_format', 'verbose_json');
            form.append('timestamp_granularities[]', 'word');
            form.append('timestamp_granularities[]', 'segment');
            const language = incoming.get('language');
            if (typeof language === 'string' && /^[a-z]{2}$/.test(language))
                form.append('language', language);
            return json(await checked(await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })));
        }
        if (action === 'separate') {
            const token = key(req, 'replicate');
            if (Number(req.headers.get('content-length')) > 25 * 1024 * 1024)
                return json({ error: 'Audio must be smaller than 24 MB.' }, 413);
            const incoming = await req.formData(), file = incoming.get('file');
            if (!(file instanceof File) || file.size > 24 * 1024 * 1024)
                return json({ error: 'Choose audio under 24 MB.' }, 400);
            const headers = { Authorization: `Bearer ${token}` };
            const upload = new FormData();
            upload.append('content', file, 'source.m4a');
            const uploaded = await checked(await fetch(`${REPLICATE}/files`, { method: 'POST', headers, body: upload }));
            const model = await checked(await fetch(`${REPLICATE}/models/cjwbw/demucs`, { headers }));
            if (!model.latest_version?.id || !uploaded.urls?.get)
                throw new Error('The separation provider returned an incomplete response.');
            const data = await checked(await fetch(`${REPLICATE}/predictions`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: model.latest_version.id, input: { audio: uploaded.urls.get, stem: 'vocals', model_name: 'htdemucs', output_format: 'wav' } }) }));
            return json({ id: data.id, status: data.status, output: data.output });
        }
        if (action === 'cancel') {
            const token = key(req, 'replicate');
            const body = await req.json() as {
                id: string;
            };
            if (!/^[a-z0-9-]{1,100}$/i.test(body.id))
                return json({ error: 'Invalid job.' }, 400);
            await checked(await fetch(`${REPLICATE}/predictions/${body.id}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }));
            return json({ canceled: true });
        }
        return json({ error: 'Unknown processing action.' }, 400);
    }
    catch (e) {
        return json({ error: e instanceof Error ? e.message : 'AI processing failed.' }, 400);
    }
}
export async function GET(req: Request) { try {
    const url = new URL(req.url), id = url.searchParams.get('id');
    if (id) {
        if (!/^[a-z0-9-]{1,100}$/i.test(id))
            return json({ error: 'Invalid job.' }, 400);
        const token = key(req, 'replicate');
        const data = await checked(await fetch(`${REPLICATE}/predictions/${id}`, { headers: { Authorization: `Bearer ${token}` } }));
        return json({ id: data.id, status: data.status, output: data.output, error: data.error });
    }
    const source = url.searchParams.get('audio');
    if (source) {
        const target = new URL(source);
        if (target.protocol !== 'https:' || !(target.hostname === 'replicate.delivery' || target.hostname.endsWith('.replicate.delivery')) || target.username || target.password)
            return json({ error: 'Invalid audio source.' }, 400);
        const r = await fetch(target, { redirect: 'error' });
        if (!r.ok)
            throw new Error('The separated audio has expired. Run separation again.');
        return new Response(r.body, { headers: { 'Content-Type': r.headers.get('Content-Type') || 'audio/wav', 'Cache-Control': 'no-store' } });
    }
    return json({ error: 'Missing job ID.' }, 400);
}
catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to read processing status.' }, 400);
} }
