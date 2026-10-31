# Tennis Strategy Design

This document outlines the design for a tennis strategy Android game.  
**The Concept:** A simultaneous turn-based strategy game simulating the tactical depth of tennis through position, prediction.

# Core Concept

1. **Genre**: Turn-Based Strategy / Sports Simulation.  
2. **Key Hook**: Simultaneous execution phases.

# Player Attributes

To start, the game uses the following attributes to determine outcomes:

1. Skill \- (0.0 \- 1.0) \- Determines how good is his base execution of a shot or a recovery/anticipation.

# The Turn Structure

The game uses a **Bundled Action System** where players lock in two decisions simultaneously before the turn is revealed.

## Phase A: The Serve

1. Server Chooses:  
   1. \[Target Zone\]  
   2. \[Recovery/Anticipation Zone\]  
2. Receiver Chooses:   
   1. \[Anticipation/Recovery Zone\]  
   2. \[Target Zone\]

## Phase B: The Resolution

1. Roll Server Shot Success \+ apply skill of the server.  
2. Roll Receiver Anticipation Success \+ apply skill of the receiver.  
3. Check if the receiver was successful.  
4. If successful:  
   1. Roll Receiver Shot Success \+ apply skill of the receiver.  
   2. Roll Server Anticipation Success \+ apply skill of the server.  
   3. Check if the server was successful.  
   4. if successful, return to phase A.  
   5. else, Receiver scores.  
5. else, Server scores.

## Shot Success Resolution Formula

When checking if a shot was successful it should take into account both the server and the receiver.  
The server should apply its skill \+ shot difficulty \+ random factor.  
The receiver (during defence) should apply its skill \+ anticipation bonus/penalty \+ random factor.

### Position Carry-over

A read also sets up the defender's next shot. One third of the read modifier (rounded to 0.01) is added to the next shot that player hits:

1. Correct read (+0.3): next shot \+0.1. Correct drop shot read (+0.6): next shot \+0.2.
2. Slight miss (-0.3 / -0.1): next shot \-0.1 / \-0.03.
3. Wrong side (-0.6): next shot \-0.2.

This applies to the return (from the serve read), the counter-attack (from the rally read), and the server's first attack of the next rally exchange (from their read of the previous counter or return). Serves have no position modifier.

Shot total: skill \+ action cost \+ position \+ random factor.

### Energy

Each player has energy from 100% (fresh) to 0% (exhausted), full at the start of every match.

1. Spending: defending a shot costs energy by how far it moves the defender (Drop Shot the most, Body and Center Deep the least); a wrong read costs extra, more the worse the read; hitting costs a little.
2. Recovery: a little after every point, more at each changeover (after every odd game of a set).
3. Fatigue: every shot and read gets a penalty of up to \-0.15, scaling with energy lost.
4. Scramble: a wrong read gets back up to half of its penalty, scaling with energy left, so fresh players keep early rallies alive and tired ones do not.

Shot total: skill \+ action cost \+ position \+ fatigue \+ random factor.  
Read total: skill \+ read modifier \+ fatigue \+ scramble \+ random factor.

The worked examples below leave energy out.

### Actions Cost:

1. Serve Actions:  
   1. Serve Wide: \-0.3  
   2. Serve Body: \-0.1  
   3. Serve T-Line: \-0.3  
2. Serve Receive Actions:  
   1. For Serve Wide:  
      1. Receive Wide: \+0.3  
      2. Receive Neutral: \-0.4  
      3. Receive T-Line: \-0.6  
   2. For Serve Body:  
      1. Receive Wide: \-0.3  
      2. Receive Neutral: \+0.3  
      3. Receive T-Line: \-0.3  
   3. For Serve T-Line:  
      1. Receive Wide: \-0.6  
      2. Receive Neutral: \-0.4  
      3. Receive T-Line: \+0.3  
3. Attack Actions:  
   1. Cross-Court: \-0.2  
   2. Down The Line: \-0.3  
   3. Center Deep: \-0.1  
   4. Drop Shot: \-0.3  
4. Defend Actions:  
   1. For Cross-Court:  
      1. Receive Cross-Court: \+0.3  
      2. Receive Down-the-Line: \-0.6  
      3. Receive Center Deep: \-0.2  
      4. Receive Drop Shot: \-0.6  
   2. For Down The Line:  
      1. Receive Cross-Court: \-0.6  
      2. Receive Down The Line: \+0.3  
      3. Receive Center Deep: \-0.4  
      4. Receive Drop Shot: \-0.3  
   3. For Center Deep:  
      1. Receive Cross-Court: \-0.3  
      2. Receive Down the Line: \-0.3  
      3. Receive Center Deep: \+0.3  
      4. Receive Drop Shot: \-0.3  
   4. For Drop Shot:   
      1. Receive Cross Court: \-0.4  
      2. Receive Down the Line: \-0.4  
      3. Receive Center Deep: \-0.4  
      4. Receive Drop Shot: \+0.6

Balance note: the risky serves (Wide, T-Line) and attacks (Down The Line, Drop Shot) cost the most, so a wrong read against them is penalised harder than against the safe ones. At equal skill, against random reads, every serve wins roughly 51-54% of the time and every attack roughly 49-60%, and no serve or attack is at least as good as another against every read.

### Examples

Server skill: 0.5  
Receiver skill: 0.5

1. Serves Wide, Receives Wide:  
   1. Wide Serve \- skill \-0.3  
   2. Anticipation Success: \+0.3  
   3. Serve Random factor (-0.3 \+ 0.3) \- 0  
   4. Receive Random factor (-0.3 \+ 0.3) \- 0  
   5. Serve total: 0.5 \- 0.3 \+ 0 \= 0.2  
   6. Receive total: 0.5 \+ 0.3 \+ 0 \= 0.8  
   7. Check (Serve \> Receive) 0.2 \< 0.8 receive was successful.  
2. Serve Wide, Receives Neutral:  
   1. Wide Serve \- skill \-0.3  
   2. Anticipation Failure (low): \-0.4  
   3. Serve Random Factor (-0.3 \+ 0.3) \- 0  
   4. Receive Random Factor (-0.3 \+ 0.3) \- 0  
   5. Serve total: 0.5 \- 0.3 \+ 0 \= 0.2  
   6. Receive total: 0.5 \- 0.4 \+ 0 \= 0.1  
   7. Check (Serve \> Receive) 0.2 \> 0.1 serve was successful.  
3. Serve Wide, Receives T-Line:  
   1. Wide Serve \- skill \-0.3  
   2. Anticipation Failure (high): \-0.6  
   3. Serve Random factor (-0.3 \+ 0.3) \- 0  
   4. Receive Random Factor (-0.3 \+ 0.3) \- 0  
   5. Serve total: 0.5 \- 0.3 \+ 0 \= 0.2  
   6. Receive total: 0.5 \- 0.6 \+ 0 \= \-0.1  
   7. Check (Serve \> Receive) 0.2 \> \-0.1 serve was successful.