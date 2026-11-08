# Video speaking notes: Weather-Aware Truck Routing

Read these while you record. The video is about 8 minutes, recorded on the local server at
**http://127.0.0.1:8000**. Text in quotes is what to say; the bullets under it are what to do on
screen. You don't need to say it word for word.

---

## Before you press record

- [ ] Start the server: `cd backend` then `uv run python manage.py runserver`.
- [ ] Open http://127.0.0.1:8000 and click **Allow** when the browser asks for your location.
- [ ] Plan one practice trip (Dallas → Denver), so the first one isn't slow on camera.
- [ ] Hard-refresh the page (Ctrl+F5) to start clean.
- [ ] Open the repo in VS Code with these tabs ready:
  - `backend/trips/domain/risk.py`
  - `backend/trips/domain/eta.py`
  - `backend/trips/domain/recommend.py`
  - `docs/01-requirements-audit.md`
  - `frontend/src/features/map/HeatmapControls.tsx`
- [ ] Close other tabs and silence notifications, and set browser zoom to 100%.

---

## 1. Introduction (0:00–0:40)

> "Hi, I'm Shoaib. This is my submission for the Spotter full-stack assessment: a weather-aware
> truck routing app built with React and Django."
>
> "The problem: a driver knows where they're going, when they leave and how heavy the load is. But
> the weather they'll actually hit depends on **where the truck is at each hour**. So the app
> compares three truck routes, checks the forecast at each checkpoint **for the time the truck will
> get there**, applies the wind, rain, snow and load-weight rules from the spec, and recommends the
> safest route. Travel time breaks ties."

---

## 2. First look at the app (0:40–1:15)

- Show the map, already centred on your location.

> "When the map opens it centres on the user's location, so a driver starts from where they are.
> If they decline the permission, it falls back to a US overview. This button brings them back to
> their location any time."

- Point at the form on the left.

> "The inputs are origin, destination, departure date and time, load weight in pounds, and how
> often to check the weather: every 10, 25 or 50 miles."

---

## 3. Plan a trip (1:15–2:45)

- Type **Dallas** and pick *Dallas, TX*. Type **Denver** and pick *Denver, CO*.

> "The autocomplete is TomTom search, called through my backend, so the API key never reaches the
> browser."

- Set load to **42,000 lb**, interval to **25 mi**, departure in the next few hours. Click
  **Plan routes**.

> "While this loads: the backend asks TomTom for truck routes, using the load plus a typical
> 35,000-pound tractor-trailer weight. TomTom often returns only two truck routes on long trips,
> so the backend also requests fallback routes through waypoints to either side, **at the same
> time**, not one after another. That keeps planning at about seven seconds."

- When results appear, point at the recommended route (highlighted) and read the
  **"Why this route"** sentence aloud.

> "Here are the three routes. The recommended one is highlighted on the map and in the panel, and
> the app explains in plain language **why** it won."

- Point at a route card.

> "Each card shows distance, driving time, the difference from the fastest route, arrival time, and
> this bar showing how many miles fall into each risk level, from Low to No Travel."

- If a card says **Via-point**:

> "This third route was forced through a waypoint. The backend rejects any that duplicate an
> existing route by more than 80%, or that take more than one and a half times as long as the
> fastest."

---

## 4. Checkpoints (2:45–3:30)

- Click a checkpoint dot on the map.

> "Every dot is a checkpoint. It has an estimated arrival time, and the weather is the forecast
> **for that hour**, not for now. Here's the wind and gusts, rain, snow and temperature, the risk
> level, and the reason, for example: 'Wind 38 mph with 42,000 lb load → Severe'."

> "Colour isn't the only signal: riskier dots are bigger, and every level is written out in text,
> so the map still works for colour-blind users."

---

## 5. Heatmap and slider (3:30–4:45)

- Drag the slider slowly from **T+0** to **T+48**, then press **Play**.

> "This is the weather heatmap along the whole corridor for the next 48 hours."

> "Here's why it stays smooth: the forecast for 49 hours across about 300 points is downloaded
> **once**. When I move the slider, the app makes no network request and React doesn't re-render
> the map. It only changes which hour's value the GPU heatmap reads, with one MapLibre call,
> `setPaintProperty`. That's why scrubbing is instant."

- Optional: open `HeatmapControls.tsx` and point at the `setPaintProperty` line.

> "The colours match the checkpoint legend. Calm but breezy areas still show a faint colour, so you
> can tell 'covered and low risk' apart from 'no data'."

- Optional: open browser devtools at 375 px wide to show the phone layout.

> "The layout works on a phone, supports dark mode, and the slider works fully from the keyboard."

---

## 6. The logic in code (4:45–6:30)

> "The grading puts 40% on logic, so let me show where it lives."

- Open `backend/trips/domain/`.

> "This folder is pure Python: no network, no database, no Django. That makes it easy to test."

- **`risk.py`**

> "The spec's wind, rain and snow tables are stored as data. Where the spec was ambiguous about
> boundaries, I made a rule: if a value lands exactly on a shared boundary, it goes to the higher,
> safer class, except where the spec says 'greater than'."
>
> "The load rules only ever **raise** the risk: 50 mph wind with 30,001 pounds is No Travel; with
> exactly 30,000 pounds it isn't. These exact boundaries are all tested."

- **`eta.py`**

> "Arrival time at each checkpoint uses TomTom's own travel time at every turn, so slow city
> stretches and fast highway stretches are both reflected, not just an average speed."

- **`recommend.py`**

> "Routes are ranked by No Travel miles, then Severe miles, High miles, average risk, and finally
> travel time. Miles are rounded to a tenth so rounding noise can't override travel time."
>
> "Each checkpoint covers the road halfway to its neighbours, so the miles add up to the route
> length. A missing forecast is shown as 'No forecast' and never counted as Low."

- **`docs/01-requirements-audit.md`**

> "I wrote down 12 places where the spec was ambiguous and the decision I made for each, so a
> reviewer can see the reasoning."

---

## 7. Quality (6:30–7:15)

> "On testing:"

- "174 backend tests, 98% coverage. Every external HTTP call is mocked, so the tests never hit a
  real API."
- "109 frontend unit tests, plus 3 Playwright end-to-end tests against the production build. One
  of them checks that moving the slider never triggers a network request."

> "On robustness:"

- "Every outbound call has a timeout."
- "Errors always come back in one consistent format with a clear message."
- "The TomTom key stays on the server and out of the logs."
- "The API is rate-limited per client."

> "Deployment is one Docker image: Django serves the React build, so it's one URL with no CORS."

---

## 8. Trade-offs and next steps (7:15–8:00)

> "Trade-offs I made deliberately:"

- "ETAs assume continuous driving. Required rest breaks aren't modelled yet."
- "Risk uses sustained wind; gusts are shown for information only."
- "The weather source is Open-Meteo, which is free but rate-limited per server address. In
  production I'd use their paid key, and the code already supports it."

> "Next steps would be gust-based risk, saving trips, and re-routing automatically when the
> forecast changes."

> "Thanks for watching. The code, docs and tests are all in the GitHub repo."

---

## If something goes wrong while recording

| What happens | What to say or do |
|---|---|
| Planning takes long | "Long truck routes take a few seconds; TomTom computes truck restrictions." |
| A weather error appears | Show it: "Errors come back with a clear message instead of a broken page." Then plan again. |
| No location prompt | Location was blocked earlier. Reset it from the icon left of the address bar, or skip that line. |
| Only two routes | "TomTom found no third route that wasn't a duplicate or a big detour, and the app doesn't invent one." |
