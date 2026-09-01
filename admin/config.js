window.MEDIX_SUPABASE = {
  url: "https://joywqacbtmgfjncmglks.supabase.co",
  anonKey: "sb_publishable_5csBMpyObwm0jNGkhkopRQ_mrMxF8lx",
  wompiPublicKey: "pub_prod_NNPz2x07CDR2vcwNFbUQfW4KKDFc3M6K",
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