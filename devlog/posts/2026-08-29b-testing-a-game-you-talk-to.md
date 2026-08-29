---
title: Testing a Game You Talk To
description: How do you QA a game where every conversation is different? Real numbers from Eruin's speech, retrieval and quest-signal test harnesses.
date: 2026-08-29
tags: testing, voice, local-ai
cover: /morrin-path.webp
coverAlt: A torchlit forest path leading toward the witch Morrin's clearing
slug: testing-a-game-you-talk-to
---

Most games can be QA'd by playing them. Eruin can't, not entirely: you talk to its
characters with your own voice, an on-device language model answers, and that same
answer can advance a quest, hand over an item, or turn you into a frog. No two
playthroughs produce the same sentences, so we can't script a test that checks for
the right ones.

What we can do is pin down every stage around the model, and measure the model
itself statistically. Today we ran the full offline test battery and we want to
share the actual numbers, including the ones that aren't flattering.

## The pipeline, timed

Everything runs locally, in-process: whisper.cpp turns your voice into text, a
llama.cpp model answers in character, Kokoro speaks the reply. On our dev machine
(RTX 4090), from the moment you release push-to-talk:

| Stage | Time since mic stop |
|---|---|
| Speech-to-text done | ~0.52 s |
| LLM reply done | ~1.4 to 1.7 s |
| NPC audio playing | ~1.8 to 2.4 s |

Roughly two seconds from your voice to the character's voice. That's the number we
guard most jealously, and it will look very different on a Steam Deck. More on that
in an upcoming post: we're writing a dedicated performance doc for the Deck, which
is our practical minimum spec.

## Speech recognition: 100 transcriptions, one trick

The STT harness runs 25 game-relevant phrases (riddle answers, quest lines, small
talk) through the exact Whisper model the game ships, in four conditions: clean,
quiet mic, room noise, and both at once. Then it runs everything again with one
change: a short "vocabulary prompt" that tells Whisper the names it's likely to
hear, like Morrin, Alder, the Wisp.

| Condition | Without prompt | With vocab prompt |
|---|---|---|
| Clean | 7.5% word error rate | 4.0% |
| Quiet mic | 7.5% | 4.0% |
| Room noise | 8.0% | 4.0% |
| Quiet and noisy | 12.3% | 4.0% |

One line of context halves the error rate and makes it flat across noise
conditions. The remaining errors are almost endearing: every single run heard
"what is Eruin" as "What is a ruin?", which, given the state of the kingdom, is
honestly a fair question.

## Memory retrieval: why we switched embedders

When you ask Alder about the city gate, the game retrieves relevant lore from an
embedded knowledge base. We originally reused the dialogue model itself to embed
those lookups (one less model to ship), and our retrieval eval shows exactly what
that cost. Twenty labeled player questions, scored on whether the right lore file
comes back first:

| Embedder | Correct on first hit | Correct in top 3 |
|---|---|---|
| Dialogue model, high tier | 11/20 | 16/20 |
| Dialogue model, low tier | 8/20 | 18/20 |
| Dialogue model, min tier | 5/20 | 15/20 |
| bge-small (dedicated, what we ship now) | 19/20 | 20/20 |

A chat model was never trained to measure sentence similarity, and it shows. The
dedicated embedding model is 130 MB, and it simply knows that "who lives deep in
the woods?" means the witch, not the history of the Long Night.

## The quest judge: keeping an eager model honest

The stealth-critical piece: when an NPC offers you a quest, a tiny classifier
reads your reply and decides, YES or NO, whether you actually accepted. Without
it, smaller models would start the quest when you say "that sounds rough, anyway
I have to go."

Today's score on the shipping low-tier model: **15/20**, reproducible across two
runs. Our recorded baseline was 16/20, so something drifted, and one of the five
misses is the bad kind (a clarifying question, "A satchel? What did it look
like?", was read as acceptance). The other four fail in the safe direction: the
quest just doesn't advance until you rephrase. It's on the fix list, and this is
exactly why the harness exists; we'd never have caught a one-case drift by
playtesting.

The deterministic layers around all of this, response parsing, vocal-action
extraction, knowledge lookup and injection, quest-action schemas, sit at **27/27**
unit tests green, and the quest state machine's own editor test suite
(`Eruin.MorrinQuest.*`, riddle data, validation, action gating) is **10/10**.

## Then we turned the game on

Offline harnesses are only half the story, so we booted the editor, loaded into
the world and talked to the characters through the real in-game pipeline while
watching the logs. On the high tier (Gemma 4 E4B, 4.97 GB resident on the GPU),
in-character replies took 1.1 to 1.4 seconds, and Kokoro synthesized 10 to 13
seconds of speech in about 1.3 to 1.6 seconds, with quest knowledge injected into
the prompt on every exchange.

The best moment came from asking the witch a hypothetical: "what happens if I
answer a riddle wrong?" The model decided this meant the riddle game should begin
and emitted a quest action. In the log, three defenses fired in a row: the quest
state machine refused the action as invalid in the current state, and the YES/NO
judge independently rejected it. But a third system, the quest journal, had
already written "Morrin's Riddle Challenge" into the tracker before the checks
ran. One idle question, and the UI claims a witch has challenged you. The state
machine held, the journal jumped the gun.

It gets better: with the state machine correctly refusing to start, the language
model simply improvised its own riddle game, asking classic riddles that aren't
in our authored set of twelve, with no stakes, no validation and no rewards
behind them. The character sounded perfectly confident the whole time. That's
the sharpest lesson of building this game so far: an LLM will never tell you
it has desynced from your game state. Both bugs are now precisely reproducible
from the log trail, which is exactly what a test session is for.

## What's next

The same battery, plus frame rate, battery drain and voice-to-voice latency,
measured on a Steam Deck. The doc is already written; the Deck is charging.

---

If you'd rather just play the thing: [wishlist Eruin on Steam](https://store.steampowered.com/app/4695190/Eruin/).
Questions about the test setup? Ask in the [Discord](https://discord.gg/JYqdYUT4u7).
