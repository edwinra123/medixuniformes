window.MEDIX_SUPABASE = {
  url: "https://YOUR_PROJECT_REF.supabase.co",
  anonKey: "YOUR_SUPABASE_ANON_KEY",
  // Solo llave PUBLICA Wompi. El secreto de integridad va en Edge Function secrets.
  wompiPublicKey: "pub_test_...",
  adminEmails: [
    "edwinramirez11e17@gmail.com"
  ]
};

window.medixIsAdminEmail = function (email) {
  const list = (window.MEDIX_SUPABASE?.adminEmails || []).map((e) =>
    String(e).toLowerCase().trim()
  );
  return list.includes(String(email || "").toLowerCase().trim());
};