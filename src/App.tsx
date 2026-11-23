import { useEffect, useRef, useState } from "react"
import type { Session } from "@supabase/supabase-js";
import "./App.css";
import { supabase } from "./lib/supabase";

type Tab = "Inicio" | "Bracket" | "Partidas" | "Jugadores" | "Administración";

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
  registration_open: boolean;
  bracket_generated_at: string | null;
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

function App() {
  const [tab, setTab] = useState<Tab>("Inicio");
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerTag, setNewPlayerTag] = useState("");
  const [registerBusy, setRegisterBusy] = useState(false);
  const [registerMessage, setRegisterMessage] = useState("");
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [registrationControlMessage, setRegistrationControlMessage] = useState("");
  const [generateBusy, setGenerateBusy] = useState(false);
  const [generateMessage, setGenerateMessage] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [musicOn, setMusicOn] = useState(false );
  const audioRef = useRef<HTMLAudioElement>(null);
  const [scoreInputs, setScoreInputs] = useState<Record<string, { a: string; b: string }>>({});
  const [resultBusyId, setResultBusyId] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState("");

  const [dbStatus, setDbStatus] = useState("CONECTANDO...");
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  const finishedMatches = matches.filter((m) => m.status === "finished").length;
  const activeMatches = matches.filter((m) => m.status === "live").length;
  const playerTag = (id: string | null) =>
    id ? (players.find((p) => p.id === id)?.tag ?? "?") : "Por definir";

    const bracketOrder = { winners: 1, losers: 2, grand_final: 3 } as const;
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

  useEffect(() => {
    async function checkConnection() {
      try {
        const { error } = await supabase.from("tournaments").select("id").limit(1);
        setDbStatus(error ? "ERROR DE CONEXIÓN" : "CONECTADO");
        if (error) console.error("Supabase:", error.message);
      } catch (error) {
        setDbStatus("ERROR DE CONEXIÓN");
        console.error("Supabase:", error);
      }
    }

    checkConnection();
  }, []);

  useEffect(() => {
    void loadTournamentAndPlayers();
  }, []);

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

  async function loadTournamentAndPlayers() {
    const { data, error } = await supabase
      .from("tournaments")
      .select("id, name, registration_open, bracket_generated_at")
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error cargando torneo:", error.message);
      return;
    }

    if (!data) {
      setTournament(null);
      setPlayers([]);
      return;
    }

    const currentTournament = data as Tournament;
    setTournament(currentTournament);
        await loadPlayers(currentTournament.id);
    await loadMatches(currentTournament.id);
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

  async function toggleRegistration() {
    if (!tournament) {
      setRegistrationControlMessage("No hay un torneo configurado.");
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
      
    async function toggleMusic(){
      const audio = audioRef.current;
      if(!audio) return;

      if(audio.paused){
        audio.volume = 0.4;
        try{
          await audio.play();
        }catch (error){
          console.error("No se pudo reproducir el audio", error);
        }
      } else {
        audio.pause();
      }
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

  async function registerPlayer() {
    setRegisterMessage("");

    const name = newPlayerName.trim();
    const gamerTag = newPlayerTag.trim();

    if (!name || !gamerTag) {
      setRegisterMessage("Escribe el nombre y el Gamer Tag.");
      return;
    }

    if (!tournament) {
      setRegisterMessage("No se encontró un torneo. Revisa la configuración en Supabase.");
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

      // La consulta se difiere para evitar ejecutar consultas de Supabase
      // dentro del callback interno de autenticación.
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>TORNE-ITO</strong>
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
            TORNE-ITO
            <br />
            Instituto Tecnológico de Orizaba
          </p>
          <span className="version">VERSIÓN 0.2.0</span>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            TORNEOS <span>/</span> TORNE-ITO
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
              <span className="champion-kicker">★ CAMPEÓN DE TORNE-ITO ★</span>
              <strong>{playerTag(champion)}</strong>
              <small>{players.find((p) => p.id === champion)?.name}</small>
            </section>
          )}
          {tab === "Inicio" && (
            <>
                            <section className="hero-banner">
                <img src="/hero.png" alt="TORNE-ITO" />
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
                <Stat label="PARTIDAS TOTALES" value={matches.length} icon="⚔" detail="Enfrentamientos creados" />
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
                  {matches
                  .filter((m) => m.status !== "finished" && m.player_1_id && m.player_2_id)
                  .slice(0, 3)
                  .map((match) => (
                    <MatchCard key={match.id} match={match} tag={playerTag} />
                  ))}
                  {matches.length === 0 && (
                    <p className="empty">Todavía no hay partidas registradas.</p>
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
                        <b>TORNE-ITO</b>
                  </div>
                  <div className="event-line">
                    <span>SEDE</span>
                    <b>Por confirmar</b>
                  </div>
                  <div className="event-line">
                    <span>FECHA</span>
                    <b>Por confirmar</b>
                  </div>
                  <div className="event-line">
                    <span>FORMATO</span>
                    <b>Doble eliminación · Propuesto</b>
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
                      <div className="bracket" style={{ overflowX: "auto" }}>
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
                {matches.map((match) => (
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
                    administradores de TORNE-ITO.
                  </p>
                  {loginMessage && <p role="status">{loginMessage}</p>}
                  <button className="secondary-btn" onClick={() => void signOut()}>
                    CERRAR SESIÓN
                  </button>
                </section>
              ) : (
                <>
                  <div className="admin-warning">
                    SESIÓN DE ADMINISTRADOR ACTIVA. El registro de participantes ya está
                    conectado a Supabase. La gestión de resultados se implementará después.
                  </div>
                  <div className="admin-grid">
                    <section className="panel">
                      <span className="section-kicker">CUENTA</span>
                      <h3>Administrador conectado</h3>
                      <p>{session.user.email}</p>
                      <button className="secondary-btn full-btn" onClick={() => void signOut()}>
                        CERRAR SESIÓN
                      </button>
                    </section>
                    <section className="panel">
                      <span className="section-kicker">INSCRIPCIONES</span>
                      <h3>Registrar participante</h3>
                      <p>
                        {tournament
                          ? `${tournament.name} · ${tournament.registration_open ? "Registro abierto" : "Registro cerrado"}`
                          : "No se encontró un torneo configurado."}
                      </p>
                      <div className="event-line">
                        <span>INSCRITOS</span>
                        <b>{players.length} participantes</b>
                      </div>
                      <button
                        className={tournament?.registration_open ? "secondary-btn full-btn" : "primary-btn full-btn"}
                        onClick={() => void toggleRegistration()}
                        disabled={!tournament || registrationBusy}
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
                      <span className="section-kicker">COMPETENCIA</span>
                      <h3>Generar bracket</h3>
                      <p>
                        {tournament?.bracket_generated_at
                          ? "El bracket ya fue generado para este torneo."
                          : tournament?.registration_open
                            ? "Cierra las inscripciones para poder generar el bracket."
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
                      <section className="panel" style={{ gridColumn: "1 / -1" }}>
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
                </>
              )}
            </Page>
          )}

          <footer className="footer">
            <span>TORNE-ITO © 2026</span>
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
        preload="none"
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