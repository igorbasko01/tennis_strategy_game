# GameScoreTracker Example

This example demonstrates how to use the `GameScoreTracker` class to track the score of a tennis game.

## Running the Example

```bash
# From the project root directory
dart run example/game_score_tracker_example.dart
```

## What This Example Shows

1. **Creating a GameScoreTracker**: Initialize with two players
2. **Event Listeners**: Subscribe to score updates and game ended events
3. **Awarding Points**: Give points to players and see the score progress
4. **Deuce Handling**: See how the tracker handles 40-40 situations
5. **Advantage Scenarios**: Watch advantage being gained and lost
6. **Game Completion**: Observe when a game is won

## Expected Output

```
=== Tennis Game Score Tracker Example ===

Starting game between Roger and Rafa

Roger serves...
Score: Roger 15 - 0 Rafa
Roger wins the point again...
Score: Roger 30 - 0 Rafa
Rafa fights back...
Score: Roger 30 - 15 Rafa
Roger gets to 40...
Score: Roger 40 - 15 Rafa
Rafa makes it 40-30...
Score: Roger 40 - 30 Rafa
Rafa brings it to deuce...
Score: Roger 40 - 40 Rafa
*** DEUCE ***
Roger gets advantage...
Score: Roger AD - 40 Rafa
Rafa sends it back to deuce...
Score: Roger 40 - 40 Rafa
*** DEUCE ***
Rafa takes advantage...
Score: Roger 40 - AD Rafa
Rafa closes it out...
Score: Roger 40 - GAME Rafa

🏆 GAME WON by Rafa! 🏆
```

## Key Features Demonstrated

- **Basic Scoring**: Points progress from 0 → 15 → 30 → 40
- **Deuce**: When both players reach 40, deuce is declared
- **Advantage**: After deuce, winning a point gives advantage
- **Back to Deuce**: Losing advantage returns the game to deuce
- **Winning**: Winning from advantage (or 40-X where X < 40) wins the game
- **Events**: Real-time score updates and game completion notifications
