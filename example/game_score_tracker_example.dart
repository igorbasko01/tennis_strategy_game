import 'package:tennis_strategy_game/models/models.dart';

/// Example usage of the GameScoreTracker class.
///
/// This example demonstrates:
/// - Creating a game score tracker
/// - Listening to score update events
/// - Listening to game ended events
/// - Awarding points to players
/// - Handling deuce and advantage scenarios
void main() {
  // Create two players
  const player1 = Player(id: '1', name: 'Roger', skill: 0.9);
  const player2 = Player(id: '2', name: 'Rafa', skill: 0.9);

  // Create the game score tracker
  final tracker = GameScoreTracker(player1: player1, player2: player2);

  // Listen to score update events
  tracker.onScoreUpdate.listen((event) {
    print('Score: ${event.player1.name} ${_scoreString(event.player1Score)} - '
        '${_scoreString(event.player2Score)} ${event.player2.name}');
    if (event.isDeuce) {
      print('*** DEUCE ***');
    }
  });

  // Listen to game ended events
  tracker.onGameEnded.listen((event) {
    print('\n🏆 GAME WON by ${event.winner.name}! 🏆\n');
  });

  print('=== Tennis Game Score Tracker Example ===\n');
  print('Starting game between ${player1.name} and ${player2.name}\n');

  // Simulate a game with deuce
  print('${player1.name} serves...');
  tracker.awardPoint(player1); // 15-0

  print('${player1.name} wins the point again...');
  tracker.awardPoint(player1); // 30-0

  print('${player2.name} fights back...');
  tracker.awardPoint(player2); // 30-15

  print('${player1.name} gets to 40...');
  tracker.awardPoint(player1); // 40-15

  print('${player2.name} makes it 40-30...');
  tracker.awardPoint(player2); // 40-30

  print('${player2.name} brings it to deuce...');
  tracker.awardPoint(player2); // 40-40 (deuce)

  print('${player1.name} gets advantage...');
  tracker.awardPoint(player1); // Advantage player1

  print('${player2.name} sends it back to deuce...');
  tracker.awardPoint(player2); // Back to deuce

  print('${player2.name} takes advantage...');
  tracker.awardPoint(player2); // Advantage player2

  print('${player2.name} closes it out...');
  tracker.awardPoint(player2); // Game won!

  // Clean up
  tracker.dispose();
}

/// Converts a GameScore to a readable string.
String _scoreString(GameScore score) {
  switch (score) {
    case GameScore.love:
      return '0';
    case GameScore.fifteen:
      return '15';
    case GameScore.thirty:
      return '30';
    case GameScore.forty:
      return '40';
    case GameScore.advantage:
      return 'AD';
    case GameScore.gameWon:
      return 'GAME';
  }
}
