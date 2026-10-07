import { sanitizeWorkspace } from './state-schema.js';
import { readDraft, writeDraft, clearDraft, readSnapshot, writeSnapshot } from './draft-store.js';
export let configured = false;
export let offline = false;
let user = null, revision = 0, pending = false;
let stageQueue = Promise.resolve();
const hintKey = 'mono-last-user';
// This identifier is not a credential. Reloads recover this tab's draft.
const tabId = sessionStorage.getItem('mono-editor-id') || crypto.randomUUID();
sessionStorage.setItem('mono-editor-id', tabId);
localStorage.removeItem('mono-session');
const draftKey = () => user.id + ':' + tabId;
const hasEncryptedPages = state => [state,...(state?.desks||[]).map(d=>d.workspace)].some(layout=>layout?.widgets?.some(w=>w.pages?.some(p=>p.encrypted)));
async function request(path, method = 'GET', data) {
  let response;
  try {
    response = await fetch('/api/' + path, {
      method, credentials: 'same-origin', headers: {
        'Content-Type': 'application/json'
      }, body: data === undefined ? undefined : JSON.stringify(data)
    });
  }
  catch {
    offline = true;
    throw Object.assign(Error('Bağlantı yok. Değişikliklerin bu cihazda tutuluyor.'), {
      code: 'OFFLINE'
    });
  }
  offline = false;
  const body = await response.json().catch(() => ({
  }));
  if (!response.ok) throw Object.assign(Error(body.error || 'İstek başarısız.'), {
    code: response.status === 409 ? 'CONFLICT' : response.status === 401 ? 'AUTH' : 'HTTP', status: response.status
  });
  return body;
}
function rememberUser() {
  if (user) localStorage.setItem(hintKey, JSON.stringify({
    id: user.id, email: user.email
  }));
  else localStorage.removeItem(hintKey);
}
export async function current() {
  try {
    const session = await request('session');
    configured = session.configured;
    user = session.user;
    rememberUser();
    return user ? {
      user
    }
    : null;
  }
  catch (error) {
    if (error.code !== 'OFFLINE') throw error;
    try {
      user = JSON.parse(localStorage.getItem(hintKey) || 'null');
    }
    catch {
      user = null;
    }
    return user ? {
      user, offline: true
    }
    : null;
  }
}
export async function signIn(email, password) {
  const data = await request('login', 'POST', {
    email, password
  });
  user = data.user;
  rememberUser();
  return {
    user
  };
}
export async function signUp(email, password) {
  const data = await request('signup', 'POST', {
    email, password
  });
  if (!data.user) return null;
  user = data.user;
  rememberUser();
  return {
    user
  };
}
export async function signOut() {
  await request('logout', 'POST', {
  });
  await stageQueue;
  if (user) await clearDraft(draftKey());
  user = null;
  revision = 0;
  pending = false;
  rememberUser();
}
export async function loadWorkspace() {
  if (!user) throw Error('Önce giriş yapmalısın.');
  let draft = await readDraft(draftKey());
  // Migrate the previous per-account queue without losing pending edits.
  if (!draft) {
    const legacy = await readDraft(user.id);
    if (legacy) {
      await writeDraft(draftKey(), legacy);
      await clearDraft(user.id);
      draft = legacy;
    }
  }
  let remote;
  try {
    remote = await request('workspace');
  }
  catch (error) {
    const local = draft || await readSnapshot(user.id);
    if (error.code === 'OFFLINE' && local) {
      revision = local.revision;
      pending = Boolean(draft);
      return local.state ? sanitizeWorkspace(local.state) : null;
    }
    throw error;
  }
  revision = remote.revision;
  await writeSnapshot(user.id, draft&&hasEncryptedPages(draft.state)?{state:sanitizeWorkspace(draft.state),revision:draft.revision}:remote);
  if (draft) {
    if (draft.revision !== revision) throw Object.assign( Error('Bu çalışma alanı başka bir sekmede değişti. Yerel kopyan korunuyor.'), {
      code: 'CONFLICT', draft, remote
    } );
    pending = true;
    return sanitizeWorkspace(draft.state);
  }
  pending = false;
  return remote.state ? sanitizeWorkspace(remote.state) : null;
}
export const hasPendingDraft = () => pending;
export function stageWorkspace(state) {
  if (!user) return Promise.resolve();
  const snapshot = sanitizeWorkspace(state), key = draftKey(), account=user.id;
  pending = true;
  stageQueue = stageQueue.catch(() => {
  }).then(async () => {
    await writeDraft(key, {state:snapshot,revision,updatedAt:Date.now(),editId:crypto.randomUUID()});
    // Do not retain the previous plaintext snapshot after protecting a page offline.
    if(hasEncryptedPages(snapshot))await writeSnapshot(account,{state:snapshot,revision});
  });
  return stageQueue;
}
export async function saveWorkspace(state) {
  if (!user) throw Error('Önce giriş yapmalısın.');
  const key = draftKey(), account = user.id;
  await stageQueue;
  const snapshot = sanitizeWorkspace(state), draft = await readDraft(key);
  const result = await request('workspace', 'PUT', {
    state: snapshot, revision
  });
  revision = result.revision;
  // Complete in the same queue as typing. Never clear a newer pending edit.
  stageQueue = stageQueue.catch(() => {
  }).then(async () => {
    await writeSnapshot(account, {
      state: snapshot, revision
    });
    const latest = await readDraft(key);
    if (latest?.editId === draft?.editId && JSON.stringify(latest?.state) === JSON.stringify(snapshot)) {
      await clearDraft(key);
      pending = false;
    }
    else if (latest) {
      await writeDraft(key, {
        ...latest, revision
      });
      pending = true;
    }
  });
  await stageQueue;
  return result;
}
export async function localDraft() {
  return user ? (await readDraft(draftKey()))?.state || null : null;
}
export async function reloadRemoteWorkspace() {
  if (!user) throw Error('Önce giriş yapmalısın.');
  // Read and validate before deleting the only local pending copy.
  const remote = await request('workspace');
  const state = remote.state ? sanitizeWorkspace(remote.state) : null;
  await stageQueue;
  await writeSnapshot(user.id, {
    ...remote, state
  });
  await clearDraft(draftKey());
  revision = remote.revision;
  pending = false;
  return state;
}

// Background reads must not advance the CAS revision while a user starts editing.
export async function refreshWorkspace(isStillClean){
  if(!user)return null;const remote=await request('workspace');await stageQueue;
  if(!isStillClean()||await readDraft(draftKey()))return null;
  const next=remote.state?sanitizeWorkspace(remote.state):null;
  await writeSnapshot(user.id,{...remote,state:next});
  if(!isStillClean())return null;revision=remote.revision;return next;
}
