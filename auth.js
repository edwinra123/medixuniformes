(() => {
  const cfg = window.MEDIX_SUPABASE || {};
  const hasConfig =
    cfg.url &&
    cfg.anonKey &&
    !String(cfg.url).includes("YOUR_PROJECT_REF") &&
    !String(cfg.anonKey).includes("YOUR_SUPABASE_ANON_KEY");

  let supabase = null;
  let initError = "";

  try {
    if (!hasConfig) {
      initError = "Falta configurar admin/config.js con tu URL y publishable key.";
    } else if (!window.supabase || !window.supabase.createClient) {
      initError = "No cargo la libreria de Supabase. Revisa tu conexion a internet.";
    } else {
      supabase = window.supabase.createClient(cfg.url, cfg.anonKey);
    }
  } catch (err) {
    initError = `Error al conectar: ${err.message || err}`;
  }

  const els = {
    authPanel: document.getElementById("auth-panel"),
    sessionPanel: document.getElementById("session-panel"),
    loginForm: document.getElementById("login-form"),
    registerForm: document.getElementById("register-form"),
    loginEmail: document.getElementById("login-email"),
    loginPassword: document.getElementById("login-password"),
    registerName: document.getElementById("register-name"),
    registerEmail: document.getElementById("register-email"),
    registerPassword: document.getElementById("register-password"),
    authError: document.getElementById("auth-error"),
    authOk: document.getElementById("auth-ok"),
    authTitle: document.getElementById("auth-title"),
    authSubtitle: document.getElementById("auth-subtitle"),
    sessionEmail: document.getElementById("session-email"),
    sessionName: document.getElementById("session-name"),
    sessionLead: document.getElementById("session-lead"),
    sessionRole: document.getElementById("session-role"),
    adminLink: document.getElementById("admin-link"),
    logoutBtn: document.getElementById("logout-btn")
  };

  function showMsg(el, message) {
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("hidden", !message);
  }

  function setAuthMode(mode) {
    const isLogin = mode === "login";
    els.loginForm.classList.toggle("hidden", !isLogin);
    els.registerForm.classList.toggle("hidden", isLogin);
    document.querySelectorAll(".auth-tab").forEach((tab) => {
      tab.classList.toggle("is-active", tab.getAttribute("data-auth") === mode);
    });
    els.authTitle.textContent = isLogin ? "Iniciar sesion" : "Registrarse";
    els.authSubtitle.textContent = isLogin
      ? "Accede a tu cuenta para seguir tus pedidos"
      : "Crea tu cuenta en Medix Uniformes";
    showMsg(els.authError, "");
    showMsg(els.authOk, "");
  }

  function showLoggedOut(message) {
    els.authPanel.classList.remove("hidden");
    els.sessionPanel.classList.add("hidden");
    setAuthMode("login");
    if (message) showMsg(els.authError, message);
  }

  function isAdminUser(user, profile) {
    const byEmail = typeof window.medixIsAdminEmail === "function"
      ? window.medixIsAdminEmail(user?.email)
      : false;
    return byEmail || profile?.role === "admin";
  }

  async function ensureAdminProfile(user, profile) {
    if (!supabase || !user?.id) return profile;
    if (!window.medixIsAdminEmail?.(user.email)) return profile;
    if (profile?.role === "admin") return profile;

    const fullName = profile?.full_name || user.user_metadata?.full_name || "Administrador Medix";
    const { data } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        full_name: fullName,
        role: "admin"
      })
      .select("full_name, role")
      .maybeSingle();

    return data || { ...profile, full_name: fullName, role: "admin" };
  }

  function showLoggedIn(user, profile, { redirectAdmin = false } = {}) {
    const isAdmin = isAdminUser(user, profile);

    if (isAdmin && redirectAdmin) {
      window.location.href = "admin/index.html";
      return;
    }

    els.authPanel.classList.add("hidden");
    els.sessionPanel.classList.remove("hidden");
    els.sessionEmail.textContent = user?.email || "";
    els.sessionName.textContent = profile?.full_name || user?.user_metadata?.full_name || "";

    if (els.sessionLead) {
      els.sessionLead.textContent = isAdmin
        ? "Sesion de administrador activa"
        : "Ya iniciaste sesion en tu cuenta";
    }

    if (els.sessionRole) {
      els.sessionRole.textContent = isAdmin ? "Rol: Administrador" : "Rol: Cliente";
      els.sessionRole.classList.remove("hidden");
      els.sessionRole.classList.toggle("is-admin", isAdmin);
    }

    if (els.adminLink) {
      els.adminLink.classList.toggle("hidden", !isAdmin);
    }
  }

  async function refreshSession({ redirectAdmin = false } = {}) {
    if (!supabase) {
      showLoggedOut(initError);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        showLoggedOut(initError || "");
        return;
      }

      let { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", session.user.id)
        .maybeSingle();

      profile = await ensureAdminProfile(session.user, profile);
      showLoggedIn(session.user, profile, { redirectAdmin });
    } catch (err) {
      showLoggedOut(`Error de sesion: ${err.message || err}`);
    }
  }

  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => setAuthMode(tab.getAttribute("data-auth")));
  });

  els.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!supabase) {
      showMsg(els.authError, initError || "Falta configurar Supabase");
      return;
    }
    showMsg(els.authError, "");
    showMsg(els.authOk, "");

    const { error } = await supabase.auth.signInWithPassword({
      email: els.loginEmail.value.trim(),
      password: els.loginPassword.value
    });

    if (error) {
      showMsg(els.authError, error.message);
      return;
    }
    await refreshSession({ redirectAdmin: true });
  });

  els.registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!supabase) {
      showMsg(els.authError, initError || "Falta configurar Supabase");
      return;
    }
    showMsg(els.authError, "");
    showMsg(els.authOk, "");

    const email = els.registerEmail.value.trim();
    const password = els.registerPassword.value;
    const fullName = els.registerName.value.trim();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role: "customer" }
      }
    });

    if (error) {
      showMsg(els.authError, error.message);
      return;
    }

    const userId = data.user?.id;
    if (userId) {
      await supabase.from("profiles").upsert({
        id: userId,
        full_name: fullName,
        role: "customer"
      });
    }

    if (data.session) {
      await refreshSession({ redirectAdmin: true });
      return;
    }

    showMsg(
      els.authOk,
      "Cuenta creada. Revisa tu correo si pide confirmacion, o inicia sesion ahora."
    );
    setAuthMode("login");
    els.loginEmail.value = email;
  });

  els.logoutBtn.addEventListener("click", async () => {
    if (supabase) await supabase.auth.signOut();
    showLoggedOut("");
  });

  // Open register tab if ?registro=1
  const params = new URLSearchParams(window.location.search);
  if (params.get("registro") === "1") setAuthMode("register");

  // Si ya hay sesion admin al abrir la pagina, ir directo al panel
  const stayOnAccount = params.get("cuenta") === "1";
  refreshSession({ redirectAdmin: !stayOnAccount });
})();
