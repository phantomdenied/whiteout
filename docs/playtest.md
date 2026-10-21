# Playtesting Whiteout

Whiteout is a downhill-skiing roguelike for phones by ?God Complex Studios. This page is for two people: the tester (what to try and how to send feedback) and the owner (how to share the build and invite testers).

- **Play:** on itch.io, https://god-complex-studios.itch.io/whiteout (best on a phone, held upright)
- **Send feedback:** the God Complex Studios Discord, https://dsc.gg/god-complex-studios, in the reports channel

The build number shows on the How to play card (the **?** button) and at the top of every feedback report.

## For testers

### What to try

Play two or three runs. You don't need to finish one. Along the way, try to:

1. **Learn the controls without help.** On first launch a How to play card opens; after that, tap **?** any time. Tell us anything that took more than a minute to figure out.
2. **Outrun the yeti.** Steer, tuck (thumb held low), double-tap to jump, and, while tucked, swipe up, left or right for a trick. Did dying ever feel unfair, or did you always know why?
3. **Take different routes.** Try a Black Diamond, a Lodge, an Event, and a bonus stage (Slalom ⚑ or Burning Man 🔥) if one shows up on the map.
4. **Reach a Summit** and fight the boss at the end of the mountain.
5. **Try the extras:** the Daily run (the same mountain for everyone today), the Chalet (spend Patches between runs), and the Sound toggle.
6. **Notice anything broken:** text cut off, buttons that do nothing, stutter, no sound, the game looking squashed.

### How to send feedback

1. Tap **Feedback** (top right, on every screen except the start demo). If you're mid-run, the game pauses.
2. Tap a **Fun so far** score from 1 to 5.
3. Write what happened in **Notes**: what felt great, what was unfair or confusing, and what you'd change.
4. Tap **Copy report**. It copies your notes plus a report the game writes for you.
5. Tap **Open the God Complex Studios Discord** and paste it in the reports channel. If the link doesn't open, the address is printed under the button.

The report holds the build number, where you are in the run, your score and goal, the seeds that replay your exact game, your Gear and passives, and your device type and screen size. It holds nothing personal: no name, account, location or contact details. If copying is blocked on your phone, the game selects the report so you can copy it by hand (long-press, then Copy).

If you're playing the build on claude.ai, there's also a **Comment with this report** button. It opens claude.ai's comment box with the report quoted, so you can leave feedback right on the page.

## For the owner

### Share the build

- **itch.io (where testers play):** every push to `main` uploads the build automatically (`.github/workflows/itch.yml`, using butler and the `BUTLER_API_KEY` repo secret). To upload by hand instead, run `npm run package:itch` and upload `release/whiteout-itch-v<version>.zip`. Kind of project: **HTML**; tick **This file will be played in the browser**; embed size 480 × 854; tick **Mobile friendly** (orientation: portrait) and **Fullscreen button**. The itch build has recorded sound, no service worker or install prompt, and its reports say `Build: itch.io`.
- **claude.ai Artifact (not for testers):** https://claude.ai/artifact/RaxP5iqEkxRSmKJ7EgzRkr is the single-file build (`npm run build:single`, `dist/artifact.html`; no recorded sound, so it uses the synthesized fallback). To let testers open it, set the artifact's **Share** menu to **Anyone with the link**. It declares `comments` (composer only), which is what shows the **Comment with this report** button.
- **Discord:** make sure the invite behind https://dsc.gg/god-complex-studios is set to **never expire** and has no use limit, and that there's a channel for reports.
- **Bump the version** for each build you send out: `VERSION` in `src/version.ts` and `version` in `package.json` (a test checks they match).

### Reading a report

- **Run seed** replays the whole run: open the replay link in the report (`?seed=…`). Pick the same skier and route to land on the same slope. Daily runs replay from the Daily button on that date.
- **Slope seed** is the one descent the tester was on, derived from the run seed.
- **Where**, **Descent** and **Status** say what they were doing when they wrote it; **Route**, **Gear** and **Passives** describe their build.

### Invite message (ready to send)

> 🎿 **Help test Whiteout!** It's a downhill-skiing roguelike for your phone: steer through the trees, tuck to outrun the yeti, and build your run with Gear across three mountains.
>
> Play here: https://god-complex-studios.itch.io/whiteout (best on a phone, held upright)
>
> Play a run or two, then tap **Feedback** in the game, rate it, add a note and tap **Copy report**. Paste it in the reports channel on our Discord: https://dsc.gg/god-complex-studios
>
> The art is placeholder for now. Thanks for playing!
