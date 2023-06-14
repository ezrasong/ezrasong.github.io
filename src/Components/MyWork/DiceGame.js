import React, { useState } from 'react';

function DiceGame() {
  const [points, setPoints] = useState(500);
  const [wagerPoints, setWagerPoints] = useState('');

  const rollDice = () => {
    const player_dice1 = Math.floor(Math.random() * 6) + 1;
    const player_dice2 = Math.floor(Math.random() * 6) + 1;
    const cpu_dice1 = Math.floor(Math.random() * 6) + 1;
    const cpu_dice2 = Math.floor(Math.random() * 6) + 1;

    const sum_player = player_dice1 + player_dice2;
    const sum_cpu = cpu_dice1 + cpu_dice2;

    if (sum_player < sum_cpu) {
      const updatedPoints = points - wagerPoints;
      setPoints(updatedPoints);

      if (updatedPoints === 0) {
        const restart = window.confirm('GAME OVER! You have 0 points left! Would you like to play again?');
        if (restart) {
          setPoints(500);
          setWagerPoints('');
        } else {
          setPoints(0);
        }
      }
    } else if (sum_player > sum_cpu) {
      const updatedPoints = points + wagerPoints;
      setPoints(updatedPoints);
      setWagerPoints('');
    }

    setWagerPoints('');
  };

  const handleWagerChange = (e) => {
    setWagerPoints(parseInt(e.target.value, 10));
  };

  return (
    <div>
      <h2>DICE GAME</h2>
      <p>You have {points} points</p>
      <label htmlFor="wagerPoints">
        Enter points to wager (-1 to QUIT):
        <input
          type="number"
          id="wagerPoints"
          value={wagerPoints}
          onChange={handleWagerChange}
          min="-1"
        />
      </label>
      <br />
      <button onClick={rollDice}>Roll Dice</button>
    </div>
  );
}

export default DiceGame;
