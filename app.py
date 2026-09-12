import os
import sys
import json
import time
from pathlib import Path
from queue import Queue, Empty
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from flask import Flask, jsonify, request, send_from_directory, Response, send_file
import mirror_engine as engine
BASE_DIR = Path(__file__).resolve().parent
DIST_DIR = BASE_DIR / 'dist'
app = Flask(__name__, static_folder=None)
app.secret_key = 'spectremirror-secret-key'

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Accept'
    return response

@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'runtime': 'flask'})

@app.route('/api/clones', methods=['GET'])
def get_clones():
    return jsonify(engine.get_all_jobs())

@app.route('/api/clone', methods=['POST', 'OPTIONS'])
def create_clone():
    if request.method == 'OPTIONS':
        return Response('', status=200)
    data = request.get_json(silent=True) or {}
    url = (data.get('url') or '').strip()
    if not url:
        return (jsonify({'error': 'URL parameter is required'}), 400)
    if not url.startswith('http://') and (not url.startswith('https://')):
        url = 'https://' + url
    job = engine.create_job(url, data)
    return (jsonify(job), 202)

@app.route('/api/clone/<job_id>', methods=['GET'])
def get_clone(job_id):
    job = engine.get_job(job_id)
    if not job:
        return (jsonify({'error': 'Specimen not found'}), 404)
    return jsonify(job)

@app.route('/api/clone/<job_id>/events')
def clone_events(job_id):
    job = engine.get_job(job_id)
    if not job:
        return (jsonify({'error': 'Specimen not found'}), 404)
    q = Queue()

    def on_event(event_data):
        q.put(event_data)
    unsub = engine.subscribe_to_job(job_id, on_event)

    def event_stream():
        try:
            yield f'data: {json.dumps(engine.get_job(job_id))}\n\n'
            while True:
                try:
                    event = q.get(timeout=25)
                    yield f'data: {json.dumps(event)}\n\n'
                except Empty:
                    yield ': ping\n\n'
        finally:
            unsub()
    return Response(event_stream(), mimetype='text/event-stream', headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no', 'Connection': 'keep-alive'})

@app.route('/api/clone/<job_id>/source', methods=['GET'])
def get_clone_source(job_id):
    job = engine.get_job(job_id)
    if not job:
        return (jsonify({'error': 'Specimen not found'}), 404)
    job_dir = Path(engine.DATA_DIR) / job_id
    orig_path = job_dir / 'original.html'
    rewritten_path = job_dir / 'index.html'
    original_html = orig_path.read_text(encoding='utf-8', errors='replace') if orig_path.exists() else ''
    rewritten_html = rewritten_path.read_text(encoding='utf-8', errors='replace') if rewritten_path.exists() else ''
    return jsonify({'originalHtml': original_html, 'rewrittenHtml': rewritten_html, 'metadata': job.get('metadata')})

@app.route('/api/clone/<job_id>/preview/', defaults={'subpath': 'index.html'})
@app.route('/api/clone/<job_id>/preview/<path:subpath>')
def get_clone_preview(job_id, subpath):
    job = engine.get_job(job_id)
    if not job:
        return ('Specimen not found', 404)
    job_dir = (Path(engine.DATA_DIR) / job_id).resolve()
    target = (job_dir / subpath).resolve()
    try:
        target.relative_to(job_dir)
    except ValueError:
        return ('Access denied', 403)
    if not target.exists() or not target.is_file():
        return (f'Asset {subpath} not found', 404)
    return send_file(str(target))

@app.route('/api/clone/<job_id>/zip')
def download_clone_zip(job_id):
    job = engine.get_job(job_id)
    if not job:
        return ('Specimen not found', 404)
    zip_path = Path(engine.DATA_DIR) / job_id / 'bundle.zip'
    if not zip_path.exists():
        return ('Bundle not ready', 404)
    filename = f'spectremirror_{job_id}_{int(time.time())}.zip'
    return send_file(str(zip_path), as_attachment=True, download_name=filename)

@app.route('/api/clone/<job_id>', methods=['DELETE'])
def delete_clone(job_id):
    engine.delete_job(job_id)
    return jsonify({'success': True})

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if not DIST_DIR.exists() or not (DIST_DIR / 'index.html').exists():
        return ('SpectreMirror frontend is not built yet. Run: npm install && npm run build', 503)
    target = (DIST_DIR / path).resolve()
    if path and target.exists() and target.is_file():
        return send_from_directory(str(DIST_DIR), path)
    return send_from_directory(str(DIST_DIR), 'index.html')
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    print(f'SpectreMirror Flask server starting on http://0.0.0.0:{port}')
    app.run(host='0.0.0.0', port=port, debug=True)
