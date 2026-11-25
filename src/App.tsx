import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import "./App.css";
import { supabase } from "./lib/supabase";
import QRCode from "qrcode";

type Tab = "Inicio" | "Bracket" | "Partidas" | "Jugadores" | "Administración";
type AdminSection = "Torneo" | "Inscripciones" | "Competencia" | "Patrocinadores";

type Player = {
  id: string;
  name: string;
  tag: string;
  character: string;
  status: string;
};

type Tournament = {
  id: string;
  name: string;
  date: string | null;
  location: string | null;
  registration_open: boolean;
  bracket_generated_at: string | null;
  is_active: boolean;
};

type Match = {
  id: string;
  bracket_type: "winners" | "losers" | "grand_final";
  round_number: number;
  match_number: number;
  round_name: string;
  player_1_id: string | null;
  player_2_id: string | null;
  winner_id: string | null;
  score_player_1: number | null;
  score_player_2: number | null;
  status: "pending" | "live" | "finished";
  station: string | null;
};

type Sponsor = {
  id: string;
  name: string;
  logo_url: string | null;
  website: string | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Por confirmar";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return "Por confirmar";
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function App() {
  const [tab, setTab] = useState<Tab>("Inicio");
  const [adminSection, setAdminSection] = useState<AdminSection>("Torneo");
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [allTournaments, setAllTournaments] = useState<Tournament[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);

  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerTag, setNewPlayerTag] = useState("");
  const [registerBusy, setRegisterBusy] = useState(false);
  const [registerMessage, setRegisterMessage] = useState("");
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [registrationControlMessage, setRegistrationControlMessage] = useState("");

  const [generateBusy, setGenerateBusy] = useState(false);
  const [generateMessage, setGenerateMessage] = useState("");
  const [scoreInputs, setScoreInputs] = useState<Record<string, { a: string; b: string }>>({});
  const [resultBusyId, setResultBusyId] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState("");

  const [editName, setEditName] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [newTName, setNewTName] = useState("");
  const [newTDate, setNewTDate] = useState("");
  const [newTLocation, setNewTLocation] = useState("");
  const [tournamentBusy, setTournamentBusy] = useState(false);
  const [tournamentMessage, setTournamentMessage] = useState("");

  const [sponsorName, setSponsorName] = useState("");
  const [sponsorWebsite, setSponsorWebsite] = useState("");
  const [sponsorFile, setSponsorFile] = useState<File | null>(null);
  const [sponsorFileKey, setSponsorFileKey] = useState(0);
  const [sponsorBusy, setSponsorBusy] = useState(false);
  const [sponsorMessage, setSponsorMessage] = useState("");

  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [musicOn, setMusicOn] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const userChoiceRef = useRef(false);

  const [qrImage, setQrImage] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const shareUrl = typeof window !== "undefined" ? window.location.origin : "";
  const isLocalhost =
  typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);

  const [dbStatus, setDbStatus] = useState("CONECTANDO...");
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  const eventName = tournament?.name ?? "TORNE-ITO";

  const playerTag = (id: string | null) =>
    id ? (players.find((p) => p.id === id)?.tag ?? "?") : "Por definir";

  const bracketOrder = { winners: 1, losers: 2, grand_final: 3 } as const;

  const grandFinal1 = matches.find((m) => m.bracket_type === "grand_final" && m.round_number === 1);
  const grandFinal2 = matches.find((m) => m.bracket_type === "grand_final" && m.round_number === 2);
  const championFromFirstFinal =
    grandFinal1?.status === "finished" && grandFinal1.winner_id === grandFinal1.player_1_id
      ? grandFinal1.winner_id
      : null;
  const champion: string | null =
    grandFinal2?.status === "finished" ? grandFinal2.winner_id : championFromFirstFinal;
  const resetPending =
    grandFinal1?.status === "finished" &&
    !championFromFirstFinal &&
    grandFinal2?.status !== "finished";
  const bracketMatches = championFromFirstFinal
    ? matches.filter((m) => m.id !== grandFinal2?.id)
    : matches;

  const totalMatches = bracketMatches.length;
  const finishedMatches = bracketMatches.filter((m) => m.status === "finished").length;
  const activeMatches = bracketMatches.filter((m) => m.status === "live").length;

  const playableMatches = matches
    .filter((m) => m.status !== "finished" && m.player_1_id && m.player_2_id)
    .sort(
      (x, y) =>
        bracketOrder[x.bracket_type] - bracketOrder[y.bracket_type] ||
        x.round_number - y.round_number ||
        x.match_number - y.match_number,
    );

  const correctableMatches = matches
    .filter((m) => m.status === "finished" && m.player_1_id && m.player_2_id)
    .sort(
      (x, y) =>
        bracketOrder[y.bracket_type] - bracketOrder[x.bracket_type] ||
        y.round_number - x.round_number ||
        y.match_number - x.match_number,
    );

  const phase = !tournament
    ? "Sin torneo"
    : champion
      ? "Terminado"
      : tournament.bracket_generated_at
        ? "En juego"
        : tournament.registration_open
          ? "Inscripciones"
          : "Listo para bracket";

  useEffect(() => {
    void loadTournamentAndPlayers();
  }, []);

    useEffect(() => {
    if (!shareUrl) return;
    QRCode.toDataURL(shareUrl, {
      width: 1024,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then(setQrImage)
      .catch((error) => console.error("Error generando QR:", error));
  }, [shareUrl]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        void loadTournamentAndPlayers();
      }
    };
    const timer = window.setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    if (tournament) {
      setEditName(tournament.name);
      setEditDate(tournament.date ?? "");
      setEditLocation(tournament.location ?? "");
    }
  }, [tournament?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.4;

    const events = ["pointerdown", "keydown", "touchstart"] as const;

    const cleanup = () => {
      events.forEach((name) => window.removeEventListener(name, startOnInteraction));
    };

    function startOnInteraction(event: Event) {
      if (userChoiceRef.current) {
        cleanup();
        return;
      }
      const target = event.target as Element | null;
      if (target?.closest?.(".music-btn")) return;

      audio!
        .play()
        .then(cleanup)
        .catch(() => {});
    }

    audio
      .play()
      .then(cleanup)
      .catch(() => {});

    events.forEach((name) => window.addEventListener(name, startOnInteraction));
    return cleanup;
  }, []);

  async function loadTournamentAndPlayers() {
    const { data, error } = await supabase
      .from("tournaments")
      .select("id, name, date, location, registration_open, bracket_generated_at, is_active")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error cargando torneos:", error.message);
      setDbStatus("ERROR DE CONEXIÓN");
      return;
    }

    setDbStatus("CONECTADO");

    const list = (data ?? []) as Tournament[];
    setAllTournaments(list);

    const active = list.find((t) => t.is_active) ?? null;
    setTournament(active);

    if (!active) {
      setPlayers([]);
      setMatches([]);
      setSponsors([]);
      setLastUpdate(new Date());
      return;
    }

    await loadPlayers(active.id);
    await loadMatches(active.id);
    await loadSponsors(active.id);
    setLastUpdate(new Date());
  }

  async function loadMatches(tournamentId: string) {
    const { data, error } = await supabase
      .from("matches")
      .select(
        "id, bracket_type, round_number, match_number, round_name, player_1_id, player_2_id, winner_id, score_player_1, score_player_2, status, station",
      )
      .eq("tournament_id", tournamentId)
      .order("round_number", { ascending: true })
      .order("match_number", { ascending: true });

    if (error) {
      console.error("Error cargando partidas:", error.message);
      return;
    }

    setMatches((data ?? []) as Match[]);
  }

  async function loadPlayers(tournamentId: string) {
    const { data, error } = await supabase
      .from("registrations")
      .select("id, status, players!inner(id, name, gamer_tag, main_character)")
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error cargando participantes:", error.message);
      return;
    }

    const loadedPlayers: Player[] = (data ?? []).map((registration: any) => {
      const player = registration.players;
      return {
        id: player.id,
        name: player.name,
        tag: player.gamer_tag,
        character: player.main_character || "Por definir",
        status: registration.status === "registered" ? "Inscrito" : registration.status,
      };
    });

    setPlayers(loadedPlayers);
  }

  async function loadSponsors(tournamentId: string) {
    const { data, error } = await supabase
      .from("sponsors")
      .select("id, name, logo_url, website")
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error cargando patrocinadores:", error.message);
      return;
    }

    setSponsors((data ?? []) as Sponsor[]);
  }

    async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareMessage("Enlace copiado.");
    } catch {
      setShareMessage("No se pudo copiar. Selecciónalo y cópialo a mano.");
    }
  }

  async function toggleMusic() {
    const audio = audioRef.current;
    if (!audio) return;

    userChoiceRef.current = true;

    if (audio.paused) {
      audio.volume = 0.4;
      try {
        await audio.play();
      } catch (error) {
        console.error("No se pudo reproducir el audio", error);
      }
    } else {
      audio.pause();
    }
  }

  /* ---------- Torneos ---------- */

  async function createTournament() {
    setTournamentMessage("");

    const name = newTName.trim();
    const location = newTLocation.trim();

    if (!name || !newTDate || !location) {
      setTournamentMessage("Escribe el nombre, la fecha y la sede del torneo nuevo.");
      return;
    }

    const confirmed = window.confirm(
      `Se creará "${name}" y quedará como torneo activo.\n\nEl torneo actual dejará de mostrarse al público, pero se conserva en el historial. ¿Continuar?`,
    );
    if (!confirmed) return;

    setTournamentBusy(true);

    const { error } = await supabase.rpc("create_tournament", {
      p_name: name,
      p_date: newTDate,
      p_location: location,
    });

    setTournamentBusy(false);

    if (error) {
      console.error("Error creando torneo:", error.message);
      setTournamentMessage(`No se pudo crear: ${error.message}`);
      return;
    }

    setNewTName("");
    setNewTDate("");
    setNewTLocation("");
    setScoreInputs({});
    setResultMessage("");
    setGenerateMessage("");
    setTournamentMessage("Torneo creado y activado. Las inscripciones están abiertas.");
    await loadTournamentAndPlayers();
  }

  async function updateTournament() {
    if (!tournament) return;
    setTournamentMessage("");

    const name = editName.trim();
    const location = editLocation.trim();

    if (!name || !editDate || !location) {
      setTournamentMessage("El nombre, la fecha y la sede no pueden quedar vacíos.");
      return;
    }

    setTournamentBusy(true);

    const { error } = await supabase.rpc("update_tournament", {
      p_tournament_id: tournament.id,
      p_name: name,
      p_date: editDate,
      p_location: location,
    });

    setTournamentBusy(false);

    if (error) {
      console.error("Error editando torneo:", error.message);
      setTournamentMessage(`No se pudo guardar: ${error.message}`);
      return;
    }

    setTournamentMessage("Cambios guardados.");
    await loadTournamentAndPlayers();
  }

  async function activateTournament(target: Tournament) {
    const confirmed = window.confirm(
      `¿Mostrar "${target.name}" como torneo activo?\n\nEl público verá este torneo y las inscripciones nuevas entrarán aquí.`,
    );
    if (!confirmed) return;

    setTournamentBusy(true);
    setTournamentMessage("");

    const { error } = await supabase.rpc("set_active_tournament", {
      p_tournament_id: target.id,
    });

    setTournamentBusy(false);

    if (error) {
      console.error("Error activando torneo:", error.message);
      setTournamentMessage(`No se pudo activar: ${error.message}`);
      return;
    }

    setScoreInputs({});
    setResultMessage("");
    setGenerateMessage("");
    setTournamentMessage(`"${target.name}" ahora es el torneo activo.`);
    await loadTournamentAndPlayers();
  }

  /* ---------- Inscripciones ---------- */

  async function toggleRegistration() {
    if (!tournament) {
      setRegistrationControlMessage("No hay un torneo activo.");
      return;
    }

    setRegistrationBusy(true);
    setRegistrationControlMessage("");

    const nextStatus = !tournament.registration_open;
    const { data, error } = await supabase.rpc("set_registration_status", {
      p_tournament_id: tournament.id,
      p_open: nextStatus,
    });

    setRegistrationBusy(false);

    if (error) {
      console.error("Error cambiando el estado de inscripciones:", error.message);
      setRegistrationControlMessage(`No se pudo actualizar: ${error.message}`);
      return;
    }

    setTournament({ ...tournament, registration_open: Boolean(data) });
    setRegistrationControlMessage(
      nextStatus ? "Inscripciones abiertas nuevamente." : "Inscripciones cerradas correctamente.",
    );
  }

  async function registerPlayer() {
    setRegisterMessage("");

    const name = newPlayerName.trim();
    const gamerTag = newPlayerTag.trim();

    if (!name || !gamerTag) {
      setRegisterMessage("Escribe el nombre y el Gamer Tag.");
      return;
    }

    if (!tournament) {
      setRegisterMessage("No hay un torneo activo. Crea uno en la sección Torneo.");
      return;
    }

    if (!tournament.registration_open) {
      setRegisterMessage("El registro de participantes está cerrado.");
      return;
    }

    setRegisterBusy(true);

    const { error } = await supabase.rpc("register_player", {
      p_name: name,
      p_gamer_tag: gamerTag,
    });

    setRegisterBusy(false);

    if (error) {
      console.error("Error registrando participante:", error.message);
      setRegisterMessage(`No se pudo registrar: ${error.message}`);
      return;
    }

    setNewPlayerName("");
    setNewPlayerTag("");
    setRegisterMessage("¡Participante registrado correctamente!");
    await loadPlayers(tournament.id);
  }

  /* ---------- Competencia ---------- */

  async function generateBracket() {
    if (!tournament) return;

    const confirmed = window.confirm(
      `Se generará el bracket con ${players.length} participantes asignados al azar. Esta acción no se puede deshacer. ¿Continuar?`,
    );
    if (!confirmed) return;

    setGenerateBusy(true);
    setGenerateMessage("");

    const { data, error } = await supabase.rpc("generate_double_elimination", {
      p_tournament_id: tournament.id,
    });

    setGenerateBusy(false);

    if (error) {
      console.error("Error generando bracket:", error.message);
      setGenerateMessage(`No se pudo generar: ${error.message}`);
      return;
    }

    const result = data as { bracket_size: number; byes: number; matches_created: number };
    setGenerateMessage(
      `Bracket generado: ${result.matches_created} partidas, tamaño ${result.bracket_size}, ${result.byes} BYE.`,
    );
    await loadTournamentAndPlayers();
  }

  async function reopenMatch(match: Match) {
    const p1 = playerTag(match.player_1_id);
    const p2 = playerTag(match.player_2_id);

    const confirmed = window.confirm(
      `${p1} ${match.score_player_1 ?? 0} - ${match.score_player_2 ?? 0} ${p2}\n\nSe borrará este resultado y la partida volverá a pendiente para capturarla de nuevo. ¿Continuar?`,
    );
    if (!confirmed) return;

    setResultBusyId(match.id);
    setResultMessage("");

    const { error } = await supabase.rpc("reopen_match", { p_match_id: match.id });

    setResultBusyId(null);

    if (error) {
      console.error("Error corrigiendo resultado:", error.message);
      setResultMessage(`No se pudo corregir: ${error.message}`);
      return;
    }

    setResultMessage("Resultado borrado. Captura el resultado correcto en la lista de partidas listas.");
    if (tournament) await loadMatches(tournament.id);
  }

  async function reportResult(match: Match) {
    const input = scoreInputs[match.id] ?? { a: "", b: "" };
    const a = Number(input.a);
    const b = Number(input.b);

    if (
      input.a === "" ||
      input.b === "" ||
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      a < 0 ||
      b < 0 ||
      a > 9 ||
      b > 9
    ) {
      setResultMessage("Escribe dos marcadores enteros entre 0 y 9.");
      return;
    }

    if (a === b) {
      setResultMessage("No puede haber empate: uno de los jugadores debe ganar.");
      return;
    }

    const p1 = playerTag(match.player_1_id);
    const p2 = playerTag(match.player_2_id);
    const winnerTag = a > b ? p1 : p2;

    const confirmed = window.confirm(
      `${p1} ${a} - ${b} ${p2}\nGanador: ${winnerTag}\n\nEsta acción no se puede deshacer. ¿Confirmar resultado?`,
    );
    if (!confirmed) return;

    setResultBusyId(match.id);
    setResultMessage("");

    const { data, error } = await supabase.rpc("report_match_result", {
      p_match_id: match.id,
      p_score_1: a,
      p_score_2: b,
    });

    setResultBusyId(null);

    if (error) {
      console.error("Error registrando resultado:", error.message);
      setResultMessage(`No se pudo registrar: ${error.message}`);
      if (tournament) await loadMatches(tournament.id);
      return;
    }

    const result = data as {
      tournament_finished: boolean;
      champion_id: string | null;
      bracket_reset: boolean;
    };

    setScoreInputs((prev) => {
      const next = { ...prev };
      delete next[match.id];
      return next;
    });

    if (result.tournament_finished) {
      setResultMessage(`¡Torneo terminado! Campeón: ${playerTag(result.champion_id)}`);
    } else if (result.bracket_reset) {
      setResultMessage("Gran Final con reset: se juega una serie decisiva.");
    } else {
      setResultMessage(`Resultado registrado. Avanza ${winnerTag}.`);
    }

    if (tournament) await loadMatches(tournament.id);
  }

  /* ---------- Patrocinadores ---------- */

  async function addSponsor() {
    setSponsorMessage("");
    if (!tournament) return;

    const name = sponsorName.trim();
    if (!name) {
      setSponsorMessage("Escribe el nombre del patrocinador.");
      return;
    }

    if (!sponsorFile) {
      setSponsorMessage("Elige el logo del patrocinador.");
      return;
    }

    const allowed: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    };
    const ext = allowed[sponsorFile.type];
    if (!ext) {
      setSponsorMessage("El logo debe ser PNG, JPG o WebP.");
      return;
    }

    if (sponsorFile.size > 2 * 1024 * 1024) {
      setSponsorMessage("El logo no puede pesar más de 2 MB.");
      return;
    }

    let website: string | null = null;
    const rawSite = sponsorWebsite.trim();
    if (rawSite) {
      try {
        const url = new URL(/^https?:\/\//i.test(rawSite) ? rawSite : `https://${rawSite}`);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocolo");
        website = url.toString();
      } catch {
        setSponsorMessage("El enlace no es válido. Ejemplo: https://mi-patrocinador.com");
        return;
      }
    }

    setSponsorBusy(true);

    const path = `${tournament.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("sponsor-logos")
      .upload(path, sponsorFile, { contentType: sponsorFile.type });

    if (uploadError) {
      console.error("Error subiendo logo:", uploadError.message);
      setSponsorBusy(false);
      setSponsorMessage(`No se pudo subir el logo: ${uploadError.message}`);
      return;
    }

    const { data: publicData } = supabase.storage.from("sponsor-logos").getPublicUrl(path);

    const { error: insertError } = await supabase.from("sponsors").insert({
      tournament_id: tournament.id,
      name,
      logo_url: publicData.publicUrl,
      website,
    });

    if (insertError) {
      console.error("Error guardando patrocinador:", insertError.message);
      await supabase.storage.from("sponsor-logos").remove([path]);
      setSponsorBusy(false);
      setSponsorMessage(`No se pudo guardar: ${insertError.message}`);
      return;
    }

    setSponsorBusy(false);
    setSponsorName("");
    setSponsorWebsite("");
    setSponsorFile(null);
    setSponsorFileKey((k) => k + 1);
    setSponsorMessage("Patrocinador agregado.");
    await loadSponsors(tournament.id);
  }

  async function deleteSponsor(sponsor: Sponsor) {
    const confirmed = window.confirm(`¿Quitar a ${sponsor.name} de los patrocinadores?`);
    if (!confirmed) return;

    setSponsorBusy(true);
    setSponsorMessage("");

    const { error } = await supabase.from("sponsors").delete().eq("id", sponsor.id);

    if (error) {
      console.error("Error borrando patrocinador:", error.message);
      setSponsorBusy(false);
      setSponsorMessage(`No se pudo quitar: ${error.message}`);
      return;
    }

    const marker = "/sponsor-logos/";
    const index = sponsor.logo_url ? sponsor.logo_url.indexOf(marker) : -1;
    if (sponsor.logo_url && index >= 0) {
      const filePath = decodeURIComponent(sponsor.logo_url.slice(index + marker.length));
      await supabase.storage.from("sponsor-logos").remove([filePath]);
    }

    setSponsorBusy(false);
    setSponsorMessage("Patrocinador quitado.");
    if (tournament) await loadSponsors(tournament.id);
  }

  /* ---------- Sesión ---------- */

  useEffect(() => {
    let active = true;

    async function checkAdmin(userId: string) {
      const { data, error } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Error verificando administrador:", error.message);
        if (active) {
          setIsAdmin(false);
          setLoginMessage("No se pudieron verificar tus permisos. Intenta nuevamente.");
        }
        return;
      }

      if (active) setIsAdmin(Boolean(data));
    }

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error("Error recuperando sesión:", error.message);
      }

      if (!active) return;

      setSession(data.session);

      if (data.session?.user) {
        await checkAdmin(data.session.user.id);
      } else {
        setIsAdmin(false);
      }

      if (active) setAuthLoading(false);
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoginMessage("");

      if (!newSession?.user) {
        setIsAdmin(false);
        setAuthLoading(false);
        return;
      }

      setTimeout(() => {
        void checkAdmin(newSession.user.id);
        setAuthLoading(false);
      }, 0);
    });

    void loadSession();

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function signIn() {
    setLoginMessage("");

    if (!loginEmail.trim() || !loginPassword) {
      setLoginMessage("Escribe tu correo y contraseña.");
      return;
    }

    setLoginBusy(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });

    setLoginBusy(false);

    if (error) {
      setLoginMessage("No se pudo iniciar sesión. Revisa tu correo y contraseña.");
      console.error("Inicio de sesión:", error.message);
      return;
    }

    setLoginPassword("");
    setLoginMessage("Sesión iniciada. Verificando permisos...");
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      setLoginMessage("No se pudo cerrar la sesión.");
      console.error("Cerrar sesión:", error.message);
      return;
    }

    setIsAdmin(false);
    setLoginMessage("");
  }

  const navigation: Tab[] = ["Inicio", "Bracket", "Partidas", "Jugadores", "Administración"];
  const adminSections: AdminSection[] = ["Torneo", "Inscripciones", "Competencia", "Patrocinadores"];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>{eventName}</strong>
            <span>LIVE TOURNAMENT</span>
          </div>
        </div>

        <div className="side-label">MENÚ PRINCIPAL</div>
        <nav>
          {navigation.map((item) => (
            <button
              key={item}
              className={tab === item ? "nav-item active" : "nav-item"}
              onClick={() => setTab(item)}
            >
              <span className="nav-icon">
                {item === "Inicio"
                  ? "⌂"
                  : item === "Bracket"
                    ? "⌘"
                    : item === "Partidas"
                      ? "⚔"
                      : item === "Jugadores"
                        ? "♙"
                        : "⚙"}
              </span>
              {item}
              {item === "Administración" && (
                <span className="nav-lock">{isAdmin ? "●" : "◆"}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button
            className={musicOn ? "music-btn on" : "music-btn"}
            onClick={() => void toggleMusic()}
            aria-label={musicOn ? "Silenciar la música" : "Activar la música"}
          >
            <svg className="music-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path fill="currentColor" d="M9 3v11.3A3.5 3.5 0 1 0 11 17.5V7h6V3H9z" />
            </svg>
            <span className="music-label">{musicOn ? "MÚSICA ON" : "MÚSICA OFF"}</span>
          </button>
          <div className="live-indicator">
            <span /> SISTEMA EN DESARROLLO
          </div>
          <p>
            {eventName}
            <br />
            Instituto Tecnológico de Orizaba
          </p>
          <span className="version">VERSIÓN 0.3.0</span>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            TORNEOS <span>/</span> {eventName}
          </div>
          <div className="topbar-right">
            <span className="event-status">BASE DE DATOS: {dbStatus}</span>
            {lastUpdate && (
              <span className="event-status">
                ACTUALIZADO {lastUpdate.toLocaleTimeString("es-MX")}
              </span>
            )}
            <span className="event-status">
              <i /> {session ? (isAdmin ? "ADMINISTRADOR" : "SESIÓN ACTIVA") : "VISTA PÚBLICA"}
            </span>
            <div className="avatar">ST</div>
          </div>
        </header>

        <div className="content">
          {champion && (tab === "Inicio" || tab === "Bracket") && (
            <section className="champion">
              <span className="champion-kicker">★ CAMPEÓN DE {eventName} ★</span>
              <strong>{playerTag(champion)}</strong>
              <small>{players.find((p) => p.id === champion)?.name}</small>
            </section>
          )}

          {tab === "Inicio" && (
            <>
              <section className="hero-banner">
                <img src="/hero.png" alt={eventName} />
              </section>
              <div className="hero-actions">
                <button className="primary-btn" onClick={() => setTab("Bracket")}>
                  VER BRACKET <span>↗</span>
                </button>
                <button className="secondary-btn" onClick={() => setTab("Jugadores")}>
                  PARTICIPANTES
                </button>
              </div>

              <div className="section-heading">
                <div>
                  <span className="section-kicker">RESUMEN DEL EVENTO</span>
                  <h2>Panel del torneo</h2>
                </div>
              </div>

              <section className="stats-grid">
                <Stat label="PARTICIPANTES" value={players.length} icon="♙" detail="Jugadores registrados" />
                <Stat label="PARTIDAS TOTALES" value={totalMatches} icon="⚔" detail="Enfrentamientos creados" />
                <Stat label="EN CURSO" value={activeMatches} icon="◉" detail="Partidas activas" />
                <Stat label="FINALIZADAS" value={finishedMatches} icon="✓" detail="Resultados registrados" />
              </section>

              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-kicker">COMPETENCIA</span>
                      <h3>Próximos enfrentamientos</h3>
                    </div>
                    <button className="text-btn" onClick={() => setTab("Partidas")}>
                      VER TODOS ↗
                    </button>
                  </div>
                  {playableMatches.slice(0, 3).map((match) => (
                    <MatchCard key={match.id} match={match} tag={playerTag} />
                  ))}
                  {playableMatches.length === 0 && (
                    <p className="empty">
                      {matches.length === 0
                        ? "Todavía no hay partidas registradas."
                        : "No hay enfrentamientos pendientes por ahora."}
                    </p>
                  )}
                </section>

                <section className="panel event-panel">
                  <span className="section-kicker">INFORMACIÓN</span>
                  <h3>El torneo comienza aquí.</h3>
                  <p>
                    Una competencia creada para reunir a la comunidad del Instituto
                    Tecnológico de Orizaba.
                  </p>
                  <div className="event-line">
                    <span>EVENTO</span>
                    <b>{eventName}</b>
                  </div>
                  <div className="event-line">
                    <span>SEDE</span>
                    <b>{tournament?.location || "Por confirmar"}</b>
                  </div>
                  <div className="event-line">
                    <span>FECHA</span>
                    <b>{formatDate(tournament?.date)}</b>
                  </div>
                  <div className="event-line">
                    <span>FORMATO</span>
                    <b>Doble eliminación</b>
                  </div>
                </section>
              </div>
            </>
          )}

          {tab === "Bracket" && (
            <Page title="Bracket" subtitle="EL CAMINO HACIA LA VICTORIA">
              {resetPending && !champion && (
                <div className="notice">
                  El jugador de Losers ganó la Gran Final: se juega una serie decisiva (reset).
                </div>
              )}
              {matches.length === 0 ? (
                <div className="notice">El bracket aún no ha sido generado.</div>
              ) : (
                (["winners", "losers", "grand_final"] as const).map((type) => {
                  const section = bracketMatches.filter((m) => m.bracket_type === type);
                  if (section.length === 0) return null;
                  const rounds = Array.from(new Set(section.map((m) => m.round_number))).sort(
                    (a, b) => a - b,
                  );
                  return (
                    <div key={type}>
                      <span className="section-kicker">
                        {type === "winners"
                          ? "WINNERS BRACKET"
                          : type === "losers"
                            ? "LOSERS BRACKET"
                            : "GRAN FINAL"}
                      </span>
                      <div className="bracket">
                        {rounds.map((round) => {
                          const inRound = section.filter((m) => m.round_number === round);
                          return (
                            <div className="bracket-round" key={round}>
                              <h3>{inRound[0].round_name.toUpperCase()}</h3>
                              {inRound.map((m) => (
                                <BracketMatch
                                  key={m.id}
                                  a={playerTag(m.player_1_id)}
                                  b={playerTag(m.player_2_id)}
                                  sa={m.status === "pending" ? null : m.score_player_1}
                                  sb={m.status === "pending" ? null : m.score_player_2}
                                />
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </Page>
          )}

          {tab === "Partidas" && (
            <Page title="Partidas" subtitle="SEGUIMIENTO DE ENFRENTAMIENTOS">
              <div className="match-list">
                {bracketMatches.map((match) => (
                  <MatchCard key={match.id} match={match} tag={playerTag} />
                ))}
                {matches.length === 0 && <p className="empty">No hay partidas todavía.</p>}
              </div>
            </Page>
          )}

          {tab === "Jugadores" && (
            <Page title="Participantes" subtitle="LOS COMPETIDORES DE ESTA EDICIÓN">
              <div className="player-summary">
                <strong>{players.length}</strong>
                <span>JUGADORES REGISTRADOS</span>
              </div>
              <div className="player-grid">
                {players.map((player, index) => (
                  <div className="player-card" key={player.id}>
                    <div className="player-number">{String(index + 1).padStart(2, "0")}</div>
                    <div className="player-avatar">{player.tag.slice(0, 1).toUpperCase()}</div>
                    <div>
                      <strong>{player.name}</strong>
                      <span>TAG: {player.tag}</span>
                      <small>{player.character}</small>
                    </div>
                    <span className="player-status">{player.status}</span>
                  </div>
                ))}
                {players.length === 0 && (
                  <p className="empty">Todavía no hay participantes inscritos en este torneo.</p>
                )}
              </div>
            </Page>
          )}

          {tab === "Administración" && (
            <Page title="Administración" subtitle="CENTRO DE CONTROL DEL TORNEO">
              {authLoading ? (
                <div className="panel">
                  <p>Verificando sesión...</p>
                </div>
              ) : !session ? (
                <section className="panel" style={{ maxWidth: "480px" }}>
                  <span className="section-kicker">ACCESO RESTRINGIDO</span>
                  <h3>Iniciar sesión</h3>
                  <p>Ingresa con la cuenta de administrador creada en Supabase.</p>

                  <label className="field-label" htmlFor="admin-email">
                    Correo electrónico
                  </label>
                  <input
                    id="admin-email"
                    type="email"
                    autoComplete="username"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="tu-correo@ejemplo.com"
                  />

                  <label className="field-label" htmlFor="admin-password">
                    Contraseña
                  </label>
                  <input
                    id="admin-password"
                    type="password"
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Tu contraseña"
                    onKeyDown={(e) => e.key === "Enter" && void signIn()}
                  />

                  {loginMessage && <p role="status">{loginMessage}</p>}

                  <button
                    className="primary-btn full-btn"
                    onClick={() => void signIn()}
                    disabled={loginBusy}
                  >
                    {loginBusy ? "INICIANDO SESIÓN..." : "ENTRAR AL PANEL"}
                  </button>
                </section>
              ) : !isAdmin ? (
                <section className="panel" style={{ maxWidth: "560px" }}>
                  <span className="section-kicker">ACCESO DENEGADO</span>
                  <h3>Esta cuenta no es administradora</h3>
                  <p>
                    La sesión está activa, pero el usuario no aparece en la lista de
                    administradores.
                  </p>
                  {loginMessage && <p role="status">{loginMessage}</p>}
                  <button className="secondary-btn" onClick={() => void signOut()}>
                    CERRAR SESIÓN
                  </button>
                </section>
              ) : (
                <>
                  <div className="admin-summary">
                    <div className="admin-stat">
                      <span>Torneo</span>
                      <strong>{tournament ? tournament.name : "Sin torneo"}</strong>
                    </div>
                    <div className="admin-stat">
                      <span>Inscritos</span>
                      <strong>{players.length}</strong>
                    </div>
                    <div className="admin-stat">
                      <span>Partidas</span>
                      <strong>
                        {finishedMatches}/{totalMatches}
                      </strong>
                    </div>
                    <div className="admin-stat">
                      <span>Estado</span>
                      <strong>{phase}</strong>
                    </div>
                  </div>

                  <div className="admin-tabs" role="tablist">
                    {adminSections.map((section) => (
                      <button
                        key={section}
                        role="tab"
                        aria-selected={adminSection === section}
                        className={adminSection === section ? "admin-tab active" : "admin-tab"}
                        onClick={() => setAdminSection(section)}
                      >
                        {section}
                      </button>
                    ))}
                  </div>

                  {/* ---------------- TORNEO ---------------- */}
                  {adminSection === "Torneo" && (
                    <div className="admin-grid">
                      <section className="panel">
                        <span className="section-kicker">TORNEO ACTIVO</span>
                        <h3>{tournament ? tournament.name : "No hay torneo activo"}</h3>
                        {tournament ? (
                          <>
                            <div className="event-line">
                              <span>FECHA</span>
                              <b>{formatDate(tournament.date)}</b>
                            </div>
                            <div className="event-line">
                              <span>SEDE</span>
                              <b>{tournament.location || "Por confirmar"}</b>
                            </div>
                            <div className="event-line">
                              <span>INSCRIPCIONES</span>
                              <b>{tournament.registration_open ? "Abiertas" : "Cerradas"}</b>
                            </div>
                            <div className="event-line">
                              <span>BRACKET</span>
                              <b>{tournament.bracket_generated_at ? "Generado" : "Sin generar"}</b>
                            </div>
                          </>
                        ) : (
                          <p>Crea un torneo nuevo para empezar.</p>
                        )}
                      </section>

                      <section className="panel">
                        <span className="section-kicker">EDITAR</span>
                        <h3>Datos del torneo</h3>

                        <label className="field-label" htmlFor="edit-name">
                          Nombre
                        </label>
                        <input
                          id="edit-name"
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={60}
                          disabled={!tournament || tournamentBusy}
                        />

                        <label className="field-label" htmlFor="edit-date">
                          Fecha
                        </label>
                        <input
                          id="edit-date"
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          disabled={!tournament || tournamentBusy}
                        />

                        <label className="field-label" htmlFor="edit-location">
                          Sede
                        </label>
                        <input
                          id="edit-location"
                          type="text"
                          value={editLocation}
                          onChange={(e) => setEditLocation(e.target.value)}
                          maxLength={80}
                          disabled={!tournament || tournamentBusy}
                        />

                        <button
                          className="primary-btn full-btn"
                          onClick={() => void updateTournament()}
                          disabled={!tournament || tournamentBusy}
                        >
                          {tournamentBusy ? "GUARDANDO..." : "GUARDAR CAMBIOS"}
                        </button>
                      </section>

                      <section className="panel wide">
                        <span className="section-kicker">NUEVO</span>
                        <h3>Crear torneo nuevo</h3>
                        <p>El torneo nuevo queda activo y con las inscripciones abiertas.</p>

                        <label className="field-label" htmlFor="new-name">
                          Nombre
                        </label>
                        <input
                          id="new-name"
                          type="text"
                          value={newTName}
                          onChange={(e) => setNewTName(e.target.value)}
                          placeholder="Ej. TORNE-ITO 2027"
                          maxLength={60}
                          disabled={tournamentBusy}
                        />

                        <label className="field-label" htmlFor="new-date">
                          Fecha
                        </label>
                        <input
                          id="new-date"
                          type="date"
                          value={newTDate}
                          onChange={(e) => setNewTDate(e.target.value)}
                          disabled={tournamentBusy}
                        />

                        <label className="field-label" htmlFor="new-location">
                          Sede
                        </label>
                        <input
                          id="new-location"
                          type="text"
                          value={newTLocation}
                          onChange={(e) => setNewTLocation(e.target.value)}
                          placeholder="Ej. Auditorio del ITO"
                          maxLength={80}
                          disabled={tournamentBusy}
                        />

                        {tournamentMessage && <p role="status">{tournamentMessage}</p>}

                        <button
                          className="primary-btn full-btn"
                          onClick={() => void createTournament()}
                          disabled={tournamentBusy}
                        >
                          {tournamentBusy ? "CREANDO..." : "CREAR TORNEO"}
                        </button>
                      </section>

                      <section className="panel wide">
                        <span className="section-kicker">HISTORIAL</span>
                        <h3>Todos los torneos</h3>
                        {allTournaments.map((t) => (
                          <div className="tournament-row" key={t.id}>
                            <div>
                              <strong>{t.name}</strong>
                              <small>
                                {formatDate(t.date)} · {t.location || "Sin sede"}
                              </small>
                            </div>
                            {t.is_active ? (
                              <span className="badge-active">ACTIVO</span>
                            ) : (
                              <button
                                className="secondary-btn"
                                disabled={tournamentBusy}
                                onClick={() => void activateTournament(t)}
                              >
                                ACTIVAR
                              </button>
                            )}
                          </div>
                        ))}
                        {allTournaments.length === 0 && <p className="empty">Todavía no hay torneos.</p>}
                      </section>

                                            <section className="panel wide">
                        <span className="section-kicker">COMPARTIR</span>
                        <h3>Código QR del torneo</h3>
                        {isLocalhost && (
                          <div className="notice">
                            Estás en tu computadora (localhost). Este QR solo funcionaría aquí. Abre la
                            app desde tu enlace público de Vercel y entra a esta sección para generar
                            el QR correcto.
                          </div>
                        )}
                        <div className="qr-box">
                          {qrImage && <img src={qrImage} alt={`Código QR de ${shareUrl}`} />}
                          <code>{shareUrl}</code>
                        </div>
                        <div className="qr-actions">
                          <a
                            className="primary-btn"
                            href={qrImage}
                            download={`qr-${eventName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`}
                          >
                            DESCARGAR QR
                          </a>
                          <button className="secondary-btn" onClick={() => void copyShareLink()}>
                            COPIAR ENLACE
                          </button>
                        </div>
                        {shareMessage && <p role="status">{shareMessage}</p>}
                      </section>

                      <section className="panel wide">
                        <span className="section-kicker">CUENTA</span>
                        <h3>Administrador conectado</h3>
                        <p>{session.user.email}</p>
                        <button className="secondary-btn full-btn" onClick={() => void signOut()}>
                          CERRAR SESIÓN
                        </button>
                      </section>
                    </div>
                  )}

                  {/* ---------------- INSCRIPCIONES ---------------- */}
                  {adminSection === "Inscripciones" && (
                    <div className="admin-grid">
                      <section className="panel">
                        <span className="section-kicker">INSCRIPCIONES</span>
                        <h3>Registrar participante</h3>
                        <p>
                          {tournament
                            ? `${tournament.name} · ${
                                tournament.bracket_generated_at
                                  ? "Bracket generado"
                                  : tournament.registration_open
                                    ? "Registro abierto"
                                    : "Registro cerrado"
                              }`
                            : "No hay un torneo activo."}
                        </p>

                        <button
                          className={
                            tournament?.registration_open ? "secondary-btn full-btn" : "primary-btn full-btn"
                          }
                          onClick={() => void toggleRegistration()}
                          disabled={
                            !tournament ||
                            registrationBusy ||
                            Boolean(tournament.bracket_generated_at)
                          }
                        >
                          {registrationBusy
                            ? "ACTUALIZANDO..."
                            : tournament?.registration_open
                              ? "CERRAR INSCRIPCIONES"
                              : "REABRIR INSCRIPCIONES"}
                        </button>
                        {registrationControlMessage && (
                          <p role="status">{registrationControlMessage}</p>
                        )}

                        <label className="field-label" htmlFor="player-name">
                          Nombre
                        </label>
                        <input
                          id="player-name"
                          type="text"
                          value={newPlayerName}
                          onChange={(e) => setNewPlayerName(e.target.value)}
                          placeholder="Nombre del participante"
                          maxLength={80}
                          disabled={!tournament?.registration_open || registerBusy}
                        />

                        <label className="field-label" htmlFor="player-tag">
                          Apodo (Gamer Tag)
                        </label>
                        <input
                          id="player-tag"
                          type="text"
                          value={newPlayerTag}
                          onChange={(e) => setNewPlayerTag(e.target.value)}
                          placeholder="Ej. Jared"
                          maxLength={30}
                          disabled={!tournament?.registration_open || registerBusy}
                          onKeyDown={(e) => e.key === "Enter" && void registerPlayer()}
                        />

                        {registerMessage && <p role="status">{registerMessage}</p>}

                        <button
                          className="primary-btn full-btn"
                          onClick={() => void registerPlayer()}
                          disabled={!tournament?.registration_open || registerBusy}
                        >
                          {registerBusy ? "REGISTRANDO..." : "REGISTRAR JUGADOR"}
                        </button>
                      </section>

                      <section className="panel">
                        <span className="section-kicker">INSCRITOS</span>
                        <h3>{players.length} participantes</h3>
                        {players.length > 0 ? (
                          <div className="chip-list">
                            {players.map((player) => (
                              <span className="chip" key={player.id}>
                                {player.tag}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="empty">Todavía no hay participantes.</p>
                        )}
                      </section>
                    </div>
                  )}

                  {/* ---------------- COMPETENCIA ---------------- */}
                  {adminSection === "Competencia" && (
                    <div className="admin-grid">
                      <section className="panel wide">
                        <span className="section-kicker">COMPETENCIA</span>
                        <h3>Generar bracket</h3>
                        <p>
                          {!tournament
                            ? "No hay un torneo activo."
                            : tournament.bracket_generated_at
                              ? "El bracket ya fue generado para este torneo."
                              : tournament.registration_open
                                ? "Cierra las inscripciones (sección Inscripciones) para poder generar el bracket."
                                : players.length < 2
                                  ? "Se necesitan al menos 2 participantes."
                                  : `Listo para generar con ${players.length} participantes.`}
                        </p>
                        <button
                          className="primary-btn full-btn"
                          onClick={() => void generateBracket()}
                          disabled={
                            !tournament ||
                            generateBusy ||
                            tournament.registration_open ||
                            Boolean(tournament.bracket_generated_at) ||
                            players.length < 2
                          }
                        >
                          {generateBusy ? "GENERANDO..." : "GENERAR BRACKET"}
                        </button>
                        {generateMessage && <p role="status">{generateMessage}</p>}
                      </section>

                      {tournament?.bracket_generated_at && (
                        <section className="panel wide">
                          <span className="section-kicker">RESULTADOS</span>
                          <h3>Registrar resultados</h3>
                          <p>
                            {playableMatches.length > 0
                              ? `${playableMatches.length} partidas listas para jugarse.`
                              : "No hay partidas listas en este momento."}
                          </p>
                          {resultMessage && <p role="status">{resultMessage}</p>}

                          {playableMatches.map((match) => {
                            const input = scoreInputs[match.id] ?? { a: "", b: "" };
                            const busy = resultBusyId === match.id;
                            return (
                              <div className="result-card" key={match.id}>
                                <div className="result-head">
                                  <span>{match.round_name}</span>
                                  <b>
                                    {match.bracket_type === "winners"
                                      ? "WINNERS"
                                      : match.bracket_type === "losers"
                                        ? "LOSERS"
                                        : "GRAN FINAL"}
                                  </b>
                                </div>
                                <div className="result-row p1">
                                  <strong>{playerTag(match.player_1_id)}</strong>
                                  <input
                                    className="score-input"
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    max={9}
                                    placeholder="0"
                                    aria-label={`Marcador de ${playerTag(match.player_1_id)}`}
                                    value={input.a}
                                    disabled={busy}
                                    onChange={(e) =>
                                      setScoreInputs({
                                        ...scoreInputs,
                                        [match.id]: { ...input, a: e.target.value },
                                      })
                                    }
                                  />
                                </div>
                                <div className="result-row p2">
                                  <strong>{playerTag(match.player_2_id)}</strong>
                                  <input
                                    className="score-input"
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    max={9}
                                    placeholder="0"
                                    aria-label={`Marcador de ${playerTag(match.player_2_id)}`}
                                    value={input.b}
                                    disabled={busy}
                                    onChange={(e) =>
                                      setScoreInputs({
                                        ...scoreInputs,
                                        [match.id]: { ...input, b: e.target.value },
                                      })
                                    }
                                  />
                                </div>
                                <button
                                  className="primary-btn full-btn"
                                  disabled={busy}
                                  onClick={() => void reportResult(match)}
                                >
                                  {busy ? "GUARDANDO..." : "REGISTRAR RESULTADO"}
                                </button>
                              </div>
                            );
                          })}

                          {correctableMatches.length > 0 && (
                            <details className="finished-list">
                              <summary>Corregir un resultado ({correctableMatches.length})</summary>
                              {correctableMatches.map((match) => (
                                <div className="finished-row" key={match.id}>
                                  <div>
                                    <span className="finished-round">{match.round_name}</span>
                                    <strong>
                                      {playerTag(match.player_1_id)} {match.score_player_1 ?? 0} -{" "}
                                      {match.score_player_2 ?? 0} {playerTag(match.player_2_id)}
                                    </strong>
                                  </div>
                                  <button
                                    className="secondary-btn"
                                    disabled={resultBusyId === match.id}
                                    onClick={() => void reopenMatch(match)}
                                  >
                                    CORREGIR
                                  </button>
                                </div>
                              ))}
                            </details>
                          )}
                        </section>
                      )}
                    </div>
                  )}

                  {/* ---------------- PATROCINADORES ---------------- */}
                  {adminSection === "Patrocinadores" && (
                    <div className="admin-grid">
                      <section className="panel">
                        <span className="section-kicker">PATROCINADORES</span>
                        <h3>Agregar patrocinador</h3>

                        <label className="field-label" htmlFor="sponsor-name">
                          Nombre
                        </label>
                        <input
                          id="sponsor-name"
                          type="text"
                          value={sponsorName}
                          onChange={(e) => setSponsorName(e.target.value)}
                          placeholder="Nombre del patrocinador"
                          maxLength={60}
                          disabled={!tournament || sponsorBusy}
                        />

                        <label className="field-label" htmlFor="sponsor-website">
                          Enlace (opcional)
                        </label>
                        <input
                          id="sponsor-website"
                          type="text"
                          inputMode="url"
                          value={sponsorWebsite}
                          onChange={(e) => setSponsorWebsite(e.target.value)}
                          placeholder="https://mi-patrocinador.com"
                          maxLength={200}
                          disabled={!tournament || sponsorBusy}
                        />

                        <label className="field-label" htmlFor="sponsor-file">
                          Logo (PNG, JPG o WebP, máx. 2 MB)
                        </label>
                        <input
                          key={sponsorFileKey}
                          id="sponsor-file"
                          className="file-input"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={!tournament || sponsorBusy}
                          onChange={(e) => setSponsorFile(e.target.files?.[0] ?? null)}
                        />

                        {sponsorMessage && <p role="status">{sponsorMessage}</p>}

                        <button
                          className="primary-btn full-btn"
                          onClick={() => void addSponsor()}
                          disabled={!tournament || sponsorBusy}
                        >
                          {sponsorBusy ? "GUARDANDO..." : "AGREGAR PATROCINADOR"}
                        </button>
                      </section>

                      <section className="panel">
                        <span className="section-kicker">ACTUALES</span>
                        <h3>{sponsors.length} patrocinadores</h3>
                        {sponsors.length > 0 ? (
                          <div className="sponsor-admin-list">
                            {sponsors.map((sponsor) => (
                              <div className="sponsor-admin-row" key={sponsor.id}>
                                {sponsor.logo_url && <img src={sponsor.logo_url} alt="" />}
                                <strong>{sponsor.name}</strong>
                                <button
                                  className="secondary-btn"
                                  disabled={sponsorBusy}
                                  onClick={() => void deleteSponsor(sponsor)}
                                >
                                  QUITAR
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="empty">Todavía no hay patrocinadores.</p>
                        )}
                      </section>
                    </div>
                  )}
                </>
              )}
            </Page>
          )}

          {sponsors.length > 0 && (
            <section className="sponsors">
              <span className="section-kicker">PATROCINADORES</span>
              <div className="sponsor-row">
                {sponsors.map((sponsor) => {
                  const content = sponsor.logo_url ? (
                    <img src={sponsor.logo_url} alt={sponsor.name} loading="lazy" />
                  ) : (
                    <span>{sponsor.name}</span>
                  );
                  return sponsor.website && /^https?:\/\//i.test(sponsor.website) ? (
                    <a
                      key={sponsor.id}
                      className="sponsor-item"
                      href={sponsor.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={sponsor.name}
                    >
                      {content}
                    </a>
                  ) : (
                    <div key={sponsor.id} className="sponsor-item" title={sponsor.name}>
                      {content}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <footer className="footer">
            <span>
              {eventName} © {new Date().getFullYear()}
            </span>
            <span>
              HECHO PARA LA COMUNIDAD ITO <b>✳</b>
            </span>
          </footer>
        </div>
      </main>

      <audio
        ref={audioRef}
        src="/musica.mp3"
        loop
        preload="auto"
        onPlay={() => setMusicOn(true)}
        onPause={() => setMusicOn(false)}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  detail,
}: {
  label: string;
  value: number;
  icon: string;
  detail: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <b>{icon}</b>
      </div>
      <strong>{value.toString().padStart(2, "0")}</strong>
      <small>{detail}</small>
    </div>
  );
}

function Page({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="page">
      <span className="section-kicker">{subtitle}</span>
      <h1>{title}</h1>
      {children}
    </section>
  );
}

function MatchCard({
  match,
  tag,
}: {
  match: Match;
  tag: (id: string | null) => string;
}) {
  const label =
    match.status === "live" ? "En curso" : match.status === "finished" ? "Finalizada" : "Pendiente";
  return (
    <div className="match-card">
      <div className="match-round">
        <span>{match.round_name}</span>
        <b className={match.status === "live" ? "status-live" : ""}>{label}</b>
      </div>
      <div className="match-players">
        <strong>{tag(match.player_1_id)}</strong>
        <span>
          {match.score_player_1 ?? 0} : {match.score_player_2 ?? 0}
        </span>
        <strong>{tag(match.player_2_id)}</strong>
      </div>
    </div>
  );
}

function BracketMatch({
  a,
  b,
  sa,
  sb,
}: {
  a: string;
  b: string;
  sa?: number | null;
  sb?: number | null;
}) {
  return (
    <div className="bracket-match">
      <div>
        {a}
        <span>{sa ?? "—"}</span>
      </div>
      <div>
        {b}
        <span>{sb ?? "—"}</span>
      </div>
    </div>
  );
}

export default App;