const matrix = document.getElementById("matrix");

export function drawMatrix(heroes, cells, band, host) {
  const board = host || matrix;
  const low = band && Number.isFinite(band.low) ? band.low : 45;
  const high = band && Number.isFinite(band.high) ? band.high : 55;
  const minGames = band && Number.isFinite(band.minGames) ? band.minGames : 5;
  const scores = rosterScores(cells, minGames);
  const ranks = bestHeroes(scores, 5);
  board.replaceChildren();
  const grid = document.createElement("div");
  grid.className = "grid";
  grid.style.gridTemplateColumns = "96px repeat(" + heroes.length + ", minmax(48px, 1fr))";
  grid.append(cellNode("", "corner"));
  heroes.forEach((hero, index) => {
    grid.append(axisNode(hero, "head colhead", ranks.get(index) || 0, scores[index]));
  });
  heroes.forEach((hero, row) => {
    grid.append(axisNode(hero, "rowhead", ranks.get(row) || 0, scores[row]));
    heroes.forEach((opponent, column) => {
      const info = cells[row] ? cells[row][column] : null;
      if (!info) {
        grid.append(cellNode("", "cell empty"));
        return;
      }
      const node = cellNode(String(Math.round(info.pct)), "cell");
      const tone = heatTone(info.pct);
      node.style.background = tone.background;
      node.style.color = tone.color;
      if (info.games < minGames) {
        node.classList.add("dim");
      }
      let title = hero.name + " против " + opponent.name + ": " + Math.round(info.pct) + "%, " + info.games + " игр";
      if (info.games < minGames) {
        title += ", мало игр";
      } else if (info.pct < low || info.pct > high) {
        title += ", вне коридора";
      }
      node.title = title;
      grid.append(node);
    });
  });
  board.append(grid);
}

function axisNode(hero, className, rank, score) {
  const node = document.createElement("div");
  node.className = rank ? className + " best" : className;
  node.title = heroTitle(hero, score, rank);
  const frame = document.createElement("div");
  frame.className = "axis-frame";
  const image = document.createElement("img");
  image.className = rank ? "axis best" : "axis";
  if (hero.image) image.src = hero.image;
  image.alt = hero.name;
  frame.append(image);
  if (rank) {
    const place = document.createElement("span");
    place.className = "place";
    place.textContent = String(rank);
    frame.append(place);
  }
  node.append(frame);
  return node;
}

function heroTitle(hero, score, rank) {
  const place = rank ? rank + " место. " : "";
  if (!score || !score.known) {
    return place + hero.name;
  }
  const average = Math.round(score.average);
  return place + hero.name + ", средний " + average + "% против ростера, " + score.known + " пар";
}

export function strongestMarks(cells, minGames, count) {
  const scores = rosterScores(cells, minGames);
  const ranked = scores
    .map((score, index) => ({ index, average: score.average, games: score.games, known: score.known }))
    .filter((score) => score.known > 0 && score.average > 50);
  ranked.sort((left, right) => right.average - left.average || right.games - left.games || left.index - right.index);
  const marks = new Map();
  ranked.slice(0, count).forEach((item, place) => {
    marks.set(item.index, { place: place + 1, average: item.average, known: item.known });
  });
  return marks;
}

export function weakestMarks(cells, minGames, count) {
  const scores = rosterScores(cells, minGames);
  const ranked = scores
    .map((score, index) => ({ index, average: score.average, games: score.games, known: score.known }))
    .filter((score) => score.known > 0 && score.average < 50);
  ranked.sort((left, right) => left.average - right.average || left.games - right.games || left.index - right.index);
  const marks = new Map();
  ranked.slice(0, count).forEach((item, place) => {
    marks.set(item.index, { place: place + 1, average: item.average, known: item.known });
  });
  return marks;
}

function rosterScores(cells, minGames) {
  return (cells || []).map((row) => {
    let sum = 0;
    let games = 0;
    let known = 0;
    (row || []).forEach((info) => {
      if (!info || info.games < minGames) {
        return;
      }
      sum += info.pct;
      games += info.games;
      known += 1;
    });
    return {
      average: known ? sum / known : null,
      games,
      known,
    };
  });
}

function bestHeroes(scores, count) {
  const ranked = scores
    .map((score, index) => ({ index, average: score.average, games: score.games, known: score.known }))
    .filter((score) => score.known > 0);
  ranked.sort((left, right) => right.average - left.average || right.games - left.games || left.index - right.index);
  const ranks = new Map();
  ranked.slice(0, count).forEach((item, place) => {
    ranks.set(item.index, place + 1);
  });
  return ranks;
}

function cellNode(text, className) {
  const node = document.createElement("div");
  node.className = className;
  node.textContent = text;
  return node;
}

function heatTone(pct) {
  const shift = Math.max(-1, Math.min(1, (pct - 50) / 25));
  const background = shift < 0 ? mix("#8d3d36", "#f3eee4", 1 + shift) : mix("#f3eee4", "#2c6a49", shift);
  return { background, color: Math.abs(shift) > 0.55 ? "#f4eee4" : "#241c16" };
}

function mix(from, to, amount) {
  const start = hex(from);
  const end = hex(to);
  const channels = start.map((value, index) => Math.round(value + (end[index] - value) * amount));
  return "rgb(" + channels.join(",") + ")";
}

function hex(value) {
  return [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16));
}
