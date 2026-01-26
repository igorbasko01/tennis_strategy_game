import 'package:flutter_test/flutter_test.dart';

import 'package:tennis_strategy_game/main.dart';

void main() {
  testWidgets('Title screen displays game name and start button', (
    WidgetTester tester,
  ) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const TennisStrategyApp());

    // Verify that the game title is displayed.
    expect(find.text('TENNIS\nSTRATEGY'), findsOneWidget);

    // Verify that the Start button is displayed.
    expect(find.text('START'), findsOneWidget);
  });

  testWidgets('Start button shows coming soon snackbar', (
    WidgetTester tester,
  ) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const TennisStrategyApp());

    // Tap the Start button.
    await tester.tap(find.text('START'));
    await tester.pump();

    // Verify that the snackbar is shown.
    expect(find.text('Coming soon...'), findsOneWidget);
  });
}
