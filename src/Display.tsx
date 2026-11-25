import { useEffect, useState } from "react";

type DisplayMatch = {
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
};

type DisplaySponsor = {
  id: string;
  name: string;
  logo_url: string | null;
};

type Props = {
  eventName: string;
  date: string;
  location: string;
  matches: DisplayMatch[];
  playerTag: (id: string | null) => string;
  playerTags: string[];
  championId: string | null;
  sponsors: DisplaySponsor[];
  qrImage: string;
  shareUrl: string;
  musicOn: boolean;
  onToggleMusic: () => void;
};

const ORDER = { winners: 1, losers: 2, grand_final: 3 } as const;
const BRACKET_LABEL = { winners: "WINNERS", losers: "LOSERS", grand_final: "GRAN FINAL" } as const;

export default function Display({
  eventName,
  date,
  location,
  matches,
  playerTag,
  playerTags,
  championId,
  sponsors,
  qrImage,
  shareUrl,
  musicOn,
  onToggleMusic,
}: Props) {
  const [tick, setTick] = useState(0);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      /* el dispositivo no permite pantalla completa */
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), 12000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        setTick((t) => t + 1);
      }
      if (event.key.toLowerCase() === "f") void toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const playable = matches
    .filter((m) => m.status !== "finished" && m.player_1_id && m.player_2_id)
    .sort(
      (a, b) =>
        ORDER[a.bracket_type] - ORDER[b.bracket_type] ||
        a.round_number - b.round_number ||
        a.match_number - b.match_number,
    );

  const finished = matches
    .filter((m) => m.status === "finished" && m.player_1_id && m.player_2_id)
    .sort((a, b) => b.round_number - a.round_number || b.match_number - a.match_number)
    .slice(0, 8);

  const slides: string[] = [];
  if (playable.length > 0) slides.push("versus");
  if (finished.length > 0) slides.push("results");
  if (matches.length === 0 && playerTags.length > 0) slides.push("players");
  slides.push("info");
  if (sponsors.length > 0) slides.push("sponsors");

  const view = championId ? "champion" : slides[tick % slides.length];
  const next = playable[0];

  return (
    <div className="screen" onClick={() => setTick((t) => t + 1)}>
      <header className="screen-top">
        <strong>{eventName}</strong>
        <span>
          <i /> EN VIVO
        </span>
      </header>

      <main className="screen-stage" key={view}>
        {view === "champion" && (
          <section className="screen-champion">
            <span>★ CAMPEÓN ★</span>
            <strong>{playerTag(championId)}</strong>
            <small>{eventName}</small>
          </section>
        )}

        {view === "versus" && next && (
          <section>
            <div className="screen-label">
              SIGUIENTE PARTIDA · {next.round_name} · {BRACKET_LABEL[next.bracket_type]}
            </div>
            <div className="versus">
              <div className="versus-side red">
                <strong>{playerTag(next.player_1_id)}</strong>
              </div>
              <div className="versus-vs">VS</div>
              <div className="versus-side blue">
                <strong>{playerTag(next.player_2_id)}</strong>
              </div>
            </div>
            {playable.length > 1 && (
              <div className="screen-queue">
                <span>EN COLA</span>
                {playable.slice(1, 4).map((m) => (
                  <div key={m.id}>
                    {playerTag(m.player_1_id)} <b>vs</b> {playerTag(m.player_2_id)}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {view === "results" && (
          <section>
            <div className="screen-label">RESULTADOS</div>
            <div className="screen-results">
              {finished.map((m) => (
                <div className="screen-result" key={m.id}>
                  <small>{m.round_name}</small>
                  <div>
                    <span className={m.winner_id === m.player_1_id ? "win" : ""}>
                      {playerTag(m.player_1_id)}
                    </span>
                    <b>
                      {m.score_player_1 ?? 0} - {m.score_player_2 ?? 0}
                    </b>
                    <span className={m.winner_id === m.player_2_id ? "win" : ""}>
                      {playerTag(m.player_2_id)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {view === "players" && (
          <section>
            <div className="screen-label">PARTICIPANTES · {playerTags.length}</div>
            <div className="screen-players">
              {playerTags.slice(0, 60).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </section>
        )}

        {view === "info" && (
          <section className="screen-info">
            <div>
              <h1>{eventName}</h1>
              <p>{date}</p>
              <p>{location}</p>
            </div>
            {qrImage && (
              <div className="screen-qr">
                <img src={qrImage} alt="Código QR del torneo" />
                <span>ESCANEA Y SIGUE EL TORNEO</span>
                <code>{shareUrl}</code>
              </div>
            )}
          </section>
        )}

        {view === "sponsors" && (
          <section>
            <div className="screen-label">PATROCINADORES</div>
            <div className="screen-sponsors">
              {sponsors.map((s) => (
                <div key={s.id}>
                  {s.logo_url ? <img src={s.logo_url} alt={s.name} /> : <span>{s.name}</span>}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="screen-bottom">
        <span>
          {date} · {location}
        </span>
        {!championId && slides.length > 1 && (
          <span className="dots">
            {slides.map((s, index) => (
              <i key={s} className={index === tick % slides.length ? "on" : ""} />
            ))}
          </span>
        )}
      </footer>

      <div className="screen-controls" onClick={(e) => e.stopPropagation()}>
        <button className="screen-btn" onClick={() => void toggleFullscreen()}>
          PANTALLA COMPLETA
        </button>
        <button className="screen-btn" onClick={onToggleMusic}>
          {musicOn ? "MÚSICA ON" : "MÚSICA OFF"}
        </button>
        <a className="screen-btn" href="#">
          SALIR
        </a>
      </div>
    </div>
  );
}