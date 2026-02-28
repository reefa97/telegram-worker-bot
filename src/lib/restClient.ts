/**
 * REST-based PostgREST client.
 * Bypasses supabase-js entirely for data operations to avoid
 * SES/lockdown.js browser extension compatibility issues.
 * Uses window.fetch directly.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export function getAuthToken(): string | null {
    try {
        const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
        const storageKey = `sb-${projectRef}-auth-token`;
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.access_token || null;
    } catch {
        return null;
    }
}

function buildHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
    const token = getAuthToken();
    const headers: Record<string, string> = {
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json',
        ...extraHeaders,
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

interface PostgrestResponse<T = any> {
    data: T | null;
    error: { message: string; details: string; hint: string; code: string } | null;
    count: number | null;
    status: number;
    statusText: string;
}

async function handleResponse(response: Response, single: boolean, maybeSingle: boolean): Promise<PostgrestResponse> {
    let data: any = null;
    const text = await response.text();
    if (text) {
        try { data = JSON.parse(text); } catch { data = text; }
    }

    if (!response.ok) {
        return {
            data: null,
            error: typeof data === 'object' && data !== null
                ? { message: data.message || data.error || text, details: data.details || '', hint: data.hint || '', code: data.code || String(response.status) }
                : { message: text, details: '', hint: '', code: String(response.status) },
            count: null,
            status: response.status,
            statusText: response.statusText,
        };
    }

    if (single) {
        if (Array.isArray(data)) data = data.length > 0 ? data[0] : null;
        if (data === null) {
            return { data: null, error: { message: 'Row not found', details: '', hint: '', code: 'PGRST116' }, count: null, status: 406, statusText: 'Not Acceptable' };
        }
    }
    if (maybeSingle) {
        if (Array.isArray(data)) data = data.length > 0 ? data[0] : null;
    }

    let count: number | null = null;
    const cr = response.headers.get('content-range');
    if (cr) { const m = cr.match(/\/(\d+)/); if (m) count = parseInt(m[1]); }

    return { data, error: null, count, status: response.status, statusText: response.statusText };
}

export class RestBuilder {
    private _table: string;
    private _method: string = 'GET';
    private _selectCols: string = '*';
    private _filters: string[] = [];
    private _orders: string[] = [];
    private _limitVal: number | null = null;
    private _offsetVal: number | null = null;
    private _body: any = null;
    private _single = false;
    private _maybeSingle = false;
    private _prefer: string[] = [];
    private _onConflict: string | null = null;
    private _count: string | null = null;
    private _abortSignal: AbortSignal | null = null;

    constructor(table: string) { this._table = table; }

    select(columns?: string, options?: { count?: string; head?: boolean }): this {
        if (this._method !== 'POST' && this._method !== 'PATCH' && this._method !== 'DELETE') {
            this._method = options?.head ? 'HEAD' : 'GET';
        }
        this._selectCols = columns || '*';
        if (options?.count) this._count = options.count;
        return this;
    }

    insert(data: any, options?: { onConflict?: string; count?: string }): this {
        this._method = 'POST';
        this._body = data;
        this._prefer.push('return=representation');
        if (options?.onConflict) this._onConflict = options.onConflict;
        if (options?.count) this._count = options.count;
        return this;
    }

    upsert(data: any, options?: { onConflict?: string; count?: string; ignoreDuplicates?: boolean }): this {
        this._method = 'POST';
        this._body = data;
        this._prefer.push('return=representation');
        this._prefer.push(options?.ignoreDuplicates ? 'resolution=ignore-duplicates' : 'resolution=merge-duplicates');
        if (options?.onConflict) this._onConflict = options.onConflict;
        if (options?.count) this._count = options.count;
        return this;
    }

    update(data: any, options?: { count?: string }): this {
        this._method = 'PATCH';
        this._body = data;
        this._prefer.push('return=representation');
        if (options?.count) this._count = options.count;
        return this;
    }

    delete(options?: { count?: string }): this {
        this._method = 'DELETE';
        this._prefer.push('return=representation');
        if (options?.count) this._count = options.count;
        return this;
    }

    // --- Filters ---
    eq(column: string, value: any): this { this._filters.push(`${column}=eq.${value}`); return this; }
    neq(column: string, value: any): this { this._filters.push(`${column}=neq.${value}`); return this; }
    gt(column: string, value: any): this { this._filters.push(`${column}=gt.${value}`); return this; }
    gte(column: string, value: any): this { this._filters.push(`${column}=gte.${value}`); return this; }
    lt(column: string, value: any): this { this._filters.push(`${column}=lt.${value}`); return this; }
    lte(column: string, value: any): this { this._filters.push(`${column}=lte.${value}`); return this; }
    like(column: string, pattern: string): this { this._filters.push(`${column}=like.${pattern}`); return this; }
    ilike(column: string, pattern: string): this { this._filters.push(`${column}=ilike.${pattern}`); return this; }
    is(column: string, value: any): this { this._filters.push(`${column}=is.${value}`); return this; }

    in(column: string, values: any[]): this {
        this._filters.push(`${column}=in.(${values.map(v => typeof v === 'string' ? `"${v}"` : v).join(',')})`);
        return this;
    }

    contains(column: string, value: any): this {
        if (Array.isArray(value)) {
            this._filters.push(`${column}=cs.${JSON.stringify(value)}`);
        } else if (typeof value === 'object') {
            this._filters.push(`${column}=cs.${JSON.stringify(value)}`);
        } else {
            this._filters.push(`${column}=cs.${value}`);
        }
        return this;
    }

    containedBy(column: string, value: any): this {
        if (Array.isArray(value)) {
            this._filters.push(`${column}=cd.${JSON.stringify(value)}`);
        } else {
            this._filters.push(`${column}=cd.${value}`);
        }
        return this;
    }

    or(filters: string, options?: { foreignTable?: string }): this {
        if (options?.foreignTable) {
            this._filters.push(`${options.foreignTable}.or=(${filters})`);
        } else {
            this._filters.push(`or=(${filters})`);
        }
        return this;
    }

    not(column: string, operator: string, value: any): this {
        this._filters.push(`${column}=not.${operator}.${value}`);
        return this;
    }

    filter(column: string, operator: string, value: any): this {
        this._filters.push(`${column}=${operator}.${value}`);
        return this;
    }

    match(query: Record<string, any>): this {
        for (const [col, val] of Object.entries(query)) this.eq(col, val);
        return this;
    }

    textSearch(column: string, query: string, options?: { type?: string; config?: string }): this {
        const t = options?.type === 'plain' ? 'plfts' : options?.type === 'phrase' ? 'phfts' : options?.type === 'websearch' ? 'wfts' : 'fts';
        const c = options?.config ? `(${options.config})` : '';
        this._filters.push(`${column}=${t}${c}.${query}`);
        return this;
    }

    // --- Modifiers ---
    order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string }): this {
        const dir = options?.ascending === false ? 'desc' : 'asc';
        const nulls = options?.nullsFirst === true ? '.nullsfirst' : options?.nullsFirst === false ? '.nullslast' : '';
        if (options?.foreignTable) {
            this._orders.push(`${options.foreignTable}.order=${column}.${dir}${nulls}`);
        } else {
            this._orders.push(`order=${column}.${dir}${nulls}`);
        }
        return this;
    }

    limit(count: number, options?: { foreignTable?: string }): this {
        if (options?.foreignTable) {
            this._filters.push(`${options.foreignTable}.limit=${count}`);
        } else {
            this._limitVal = count;
        }
        return this;
    }

    range(from: number, to: number): this {
        this._offsetVal = from;
        this._limitVal = to - from + 1;
        return this;
    }

    single(): this { this._single = true; return this; }
    maybeSingle(): this { this._maybeSingle = true; return this; }
    abortSignal(signal: AbortSignal): this { this._abortSignal = signal; return this; }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    returns<_T>(): this { return this; } // Type-only method for compatibility

    // --- Thenable ---
    then<T1 = PostgrestResponse, T2 = never>(
        onfulfilled?: ((value: PostgrestResponse) => T1 | PromiseLike<T1>) | null,
        onrejected?: ((reason: any) => T2 | PromiseLike<T2>) | null
    ): Promise<T1 | T2> {
        return this._execute().then(onfulfilled, onrejected);
    }

    catch<T = never>(onrejected?: ((reason: any) => T | PromiseLike<T>) | null): Promise<PostgrestResponse | T> {
        return this._execute().catch(onrejected);
    }

    private async _execute(): Promise<PostgrestResponse> {
        const params: string[] = [];

        // PostgREST select uses special chars like () for embedded resources
        // Only encode spaces and truly unsafe characters, preserve PostgREST syntax
        const encodeSelect = (s: string) => s.replace(/\s+/g, '').replace(/#/g, '%23');

        if (this._method === 'GET' || this._method === 'HEAD') {
            params.push(`select=${encodeSelect(this._selectCols)}`);
        }
        // For PATCH/DELETE with select
        if (this._method === 'PATCH' || this._method === 'DELETE' || this._method === 'POST') {
            params.push(`select=${encodeSelect(this._selectCols)}`);
        }

        params.push(...this._filters);
        params.push(...this._orders);
        if (this._limitVal !== null) params.push(`limit=${this._limitVal}`);
        if (this._offsetVal !== null) params.push(`offset=${this._offsetVal}`);
        if (this._onConflict) params.push(`on_conflict=${this._onConflict}`);

        const qs = params.length > 0 ? `?${params.join('&')}` : '';
        const url = `${SUPABASE_URL}/rest/v1/${this._table}${qs}`;

        const extraHeaders: Record<string, string> = {};
        if (this._count) this._prefer.push(`count=${this._count}`);
        if (this._prefer.length > 0) extraHeaders['Prefer'] = this._prefer.join(', ');

        const headers = buildHeaders(extraHeaders);

        const fetchOpts: RequestInit = { method: this._method, headers };
        if (this._body !== null && (this._method === 'POST' || this._method === 'PATCH')) {
            fetchOpts.body = JSON.stringify(this._body);
        }
        if (this._abortSignal) fetchOpts.signal = this._abortSignal;

        try {
            const response = await window.fetch(url, fetchOpts);
            return handleResponse(response, this._single, this._maybeSingle);
        } catch (err: any) {
            return {
                data: null,
                error: { message: err.message || 'Network error', details: '', hint: '', code: 'FETCH_ERROR' },
                count: null, status: 0, statusText: 'Network Error',
            };
        }
    }
}

// --- RPC ---
export async function rpc(fnName: string, params?: Record<string, any>, options?: { count?: string; head?: boolean }): Promise<PostgrestResponse> {
    const url = `${SUPABASE_URL}/rest/v1/rpc/${fnName}`;
    const extraHeaders: Record<string, string> = {};
    const prefer: string[] = [];
    if (options?.count) prefer.push(`count=${options.count}`);
    if (prefer.length > 0) extraHeaders['Prefer'] = prefer.join(', ');

    const headers = buildHeaders(extraHeaders);

    try {
        const res = await window.fetch(url, {
            method: options?.head ? 'HEAD' : 'POST',
            headers,
            body: params ? JSON.stringify(params) : undefined,
        });
        return handleResponse(res, false, false);
    } catch (err: any) {
        return {
            data: null,
            error: { message: err.message || 'Network error', details: '', hint: '', code: 'FETCH_ERROR' },
            count: null, status: 0, statusText: 'Network Error',
        };
    }
}

// --- Factory ---
export function from(table: string): RestBuilder {
    return new RestBuilder(table);
}
