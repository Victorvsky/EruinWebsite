---
title: Faces in the Long Night: Character Cards, Quicker Voices and a New Engine
description: Character cards for the people you meet, replies that start speaking three times sooner, NPCs who remember your name, and a move to Unreal Engine 5.8.
date: 2026-10-27
tags: memories, voice, animation, development
cover: /devlog/media/character-cards/cards.webp
coverAlt: Two character cards in ornate gold frames. The left shows a bearded traveler with a satchel; the right is a black silhouette with three question marks on its name plate.
slug: faces-in-the-long-night
---

*Card art from the current development build. Names are left off on purpose.*

Since the last devlog, Eruin has gained a face for everyone you meet, a faster voice for everyone who answers, and a new engine underneath it all. Here is what changed in the current development build.

## A card for everyone you meet

The Memories screen now shows each character as an illustrated card in a gold frame. Their name sits on the plate at the bottom, and the fragments you have uncovered about them sit beside it.

Someone you have not truly met yet is only a black outline, with **???** on the plate and *Not yet known* underneath. Like an achievement you have not earned, the card tells you there is someone there to find. It tells you nothing else. Once you learn who they are through the story, the outline fills in with their portrait and their name.

Every character card is hand-painted around the in-game character, so the person on the card is the person standing in front of you.

## A pause menu with everything in one place

Pausing now opens one menu with four pages:

- **Map**: follow the people whose names you know. The city stays hidden until you have been there.
- **Journal**: your current quests and the conversations you have had.
- **Memories**: the character cards and what you have learned about each person.
- **System**: save, load, options, and a way to send us feedback.

Your latest save shows its thumbnail as soon as it is taken. M opens the map and J the journal straight from play.

## Voices that answer sooner

Talking is the heart of Eruin, so waiting for an answer matters more here than in most games.

- **Replies start speaking about three times sooner.** Characters now begin talking as soon as their first sentence is ready, instead of waiting for the whole reply.
- **Speech recognition is faster and more accurate.** It now runs on your graphics card with a larger model.
- **Short answers are heard properly.** A one-word answer to a riddle is easy to mishear, so the game now listens again using the riddle itself as a hint.
- **Characters remember your name.** Tell someone who you are, and they will keep using it.
- **You can skip.** Tap X to end a character's line, or hold X to skip narration.

The witch is also a little kinder: on your second attempt at her riddles, she forgives one wrong answer. Only one.

## Characters that move like people

We moved Eruin to **Unreal Engine 5.8**. The biggest gain so far is Epic's new animation system for walking. The traveler at the gate now starts, stops and turns with his own weight, and still keeps his idle poses and gestures while he talks.

Characters also look at you when you speak and turn to face you, rather than talking past your shoulder.

## Light in the dark

Eruin is set during the Long Night, so fire matters. Lanterns now line the road and the town, and the flame pillars light up as you approach. We also fixed a lighting bug that made hair glow when you stood next to a fire.

## Saves, achievements and the Steam Deck

- Saves are about 300 times smaller, and progress is kept per journey.
- Steam achievements are in. Their descriptions avoid naming anyone, so they won't spoil who you meet.
- We are testing regular builds on the Steam Deck, which uses a smaller language model so conversations still run locally.

## What's next

Next is playtesting all of this together: how it feels to move from a conversation, to your Memories, to the map and back. We also want more people to meet, and more cards to fill in.

If you would like to see who is waiting in the Long Night, [wishlist Eruin on Steam](https://store.steampowered.com/app/4695190/Eruin/?utm_source=eruin_website&utm_medium=referral&utm_campaign=wishlist).
