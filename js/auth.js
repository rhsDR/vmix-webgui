const SB_URL  = 'https://rxzxdcweqpbnvfkpnnrn.supabase.co';
const SB_KEY  = 'sb_publishable_dE8VWimD15O5nYvha1B6lA_KW9ZtO1C';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4enhkY3dlcXBibnZma3BubnJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzYzMTUsImV4cCI6MjA5MDgxMjMxNX0.e6DtMVskOwcMyJBFJDIEYsSZC0HAcD7AhNcg5PvlArU';

const sbClient = window.supabase.createClient(SB_URL, SB_KEY);

function sbHeaders() {
  return {
    'apikey': SB_ANON,
    'Authorization': 'Bearer ' + SB_ANON,
    'Content-Type': 'application/json'
  };
}

async function getSession() {
  const { data } = await sbClient.auth.getSession();
  return data?.session || null;
}

async function getUser() {
  const { data } = await sbClient.auth.getUser();
  return data?.user || null;
}

async function isAdmin(userId) {
  try {
    const res = await fetch(
      SB_URL + '/rest/v1/user_roles?user_id=eq.' + userId + '&select=role',
      { headers: sbHeaders() }
    );
    const rows = await res.json();
    return rows[0]?.role === 'admin';
  } catch {
    return false;
  }
}

async function signOut() {
  await sbClient.auth.signOut();
  window.location.href = 'index.html';
}

// Redirect til login hvis ikke logget ind — returnerer session
async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  return session;
}

// Redirect til projects hvis allerede logget ind (bruges på login-siden)
async function redirectIfLoggedIn() {
  const session = await getSession();
  if (session) {
    window.location.href = 'projects.html';
  }
}
