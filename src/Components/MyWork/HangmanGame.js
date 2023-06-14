import React, { useState } from 'react';

const Hangman = () => {
  const [gameState, setGameState] = useState(false);
  const [guesses, setGuesses] = useState(6);
  const [topic, setTopic] = useState('');
  const [word, setWord] = useState('');
  const [win, setWin] = useState(0);
  const [wordLetters, setWordLetters] = useState([]);
  const [secretWord, setSecretWord] = useState([]);
  const [letterList, setLetterList] = useState([
    'A', 'B', 'C', 'D', 'E',
    'F', 'G', 'H', 'I', 'J',
    'K', 'L', 'M', 'N', 'O',
    'P', 'Q', 'R', 'S', 'T',
    'U', 'V', 'W', 'X', 'Y', 'Z'
  ]);
  const [letterUsed, setLetterUsed] = useState([]);

  // Function to get the topic plus the corresponding word for that topic
  const getWordTopic = () => {
    const topicWordList = [
      ['League', 'Coding Languages', 'Names', 'Music Genres', 'Emotions', 'Countries', 'Animals', 'Subjects', 'Food', 'Clothing'],
      ['AATROX', 'AKALI', 'PROTOBELT', 'MAOKAI', 'JINX', 'EZREAL', 'GALEFORCE', 'HEXTECH', 'JUNGLE', 'SMITE'],
      ['JAVA', 'PYTHON', 'JAVASCRIPT', 'HTML', 'CSS', 'PHP', 'C', 'SQL', 'NOSQL', 'RUST'],
      ['EZRA', 'KEVIN', 'JAEDON', 'ASHVEEN', 'TAHIR', 'SAFWAN', 'DAN', 'GURVIR', 'JESSICA', 'EVAN'],
      ['ROCK', 'PUNK', 'POP', 'CLASSICAL', 'BLUES', 'DISCOTECH', 'TECHNO', 'DANCE', 'BEDROOM', 'METAL'],
      ['HAPPY', 'SAD', 'ANGRY', 'SURPRISED', 'MOODY', 'DEPRESSED', 'TIRED', 'GLOOMY', 'WACKY', 'CRANKY'],
      ['CHINA', 'VIETNAM', 'CANADA', 'MEXICO', 'UKRAINE', 'SWITZERLAND', 'ROMANIA', 'JAPAN', 'KOREA'],
      ['BIRD', 'DOG', 'CAT', 'FISH', 'TURTLE', 'FROG', 'CHICKEN', 'GERBIL', 'HAMSTER', 'BAT'],
      ['MATH', 'BIOLOGY', 'PHYSICS', 'CHEMISTRY', 'FUNCTIONS', 'CALCULUS', 'COMPUTERSCIENCE', 'BUSINESS', 'ANTHROPOLOGY', 'ENGLISH'],
      ['PIZZA', 'WINGS', 'APPLE', 'BANANA', 'PORK', 'STEAK', 'RIBS', 'FRIES', 'POUTINE', 'BURGER'],
      ['SHOES', 'HAT', 'PANTS', 'SHIRT', 'JACKET', 'TANKTOP', 'SKIRT', 'SOCKS', 'GLASSES', 'MASK']
    ];

    const topicIndex = Math.floor(Math.random() * 10);
    const wordIndex = Math.floor(Math.random() * 10);

    setTopic(topicWordList[0][topicIndex]);
    setWord(topicWordList[topicIndex + 1][wordIndex]);
    setWin(topicWordList[topicIndex + 1][wordIndex].length);
    setWordLetters(topicWordList[topicIndex + 1][wordIndex].split(''));
    setSecretWord(Array(topicWordList[topicIndex + 1][wordIndex].length).fill('-'));
  };

  // Game Function, used to be able to restart the game in case of a loss.
  const startGame = () => {
    setGameState(true);
    setGuesses(6);
    getWordTopic();
    setLetterList([
      'A', 'B', 'C', 'D', 'E',
      'F', 'G', 'H', 'I', 'J',
      'K', 'L', 'M', 'N', 'O',
      'P', 'Q', 'R', 'S', 'T',
      'U', 'V', 'W', 'X', 'Y', 'Z'
    ]);
    setLetterUsed([]);
  };

  // Function to handle user input
  const handleInput = (userInput) => {
    if (!gameState) return;

    const userInputUpper = userInput.toUpperCase();

    if (!letterUsed.includes(userInputUpper) && letterList.includes(userInputUpper)) {
      setLetterUsed([...letterUsed, userInputUpper]);
      setLetterList(letterList.filter((letter) => letter !== userInputUpper));

      if (!wordLetters.includes(userInputUpper)) {
        setGuesses(guesses - 1);
      }
    } else if (letterUsed.includes(userInputUpper) && win !== 0) {
      console.log('Already used this letter');
    } else if (userInput.length > 1 && win !== 0) {
      console.log('Please enter a correct or single character');
    }

    if (userInput === '!') {
      const input = prompt('Enter the secret word:').toUpperCase();
      if (input === word) {
        setWin(0);
      } else {
        setGuesses(0);
      }
    }

    const updatedSecretWord = secretWord.map((letter, index) => {
      if (userInput === wordLetters[index]) {
        return userInput;
      }
      return letter;
    });

    setSecretWord(updatedSecretWord);

    if (guesses === 0) {
      console.log(`GAME OVER! The secret word was ${word}`);
      setGameState(false);
    } else if (win === 0) {
      console.log(`Congratulations... ${word} is correct!`);
      setGameState(false);
    }
  };

  return (
    <div>
      <h1 className="title">WELCOME TO HANGMAN!</h1>
      <button onClick={startGame}>Start Game</button>
      {gameState && (
        <div>
          <h2>TOPIC: {topic}</h2>
          <h3>Secret Word: {secretWord.join('')}</h3>
          <p>Letters Remaining: {letterList.join('')}</p>
          <p>Letters Used: {letterUsed.join('')}</p>
          <p>Guesses Remaining: {guesses}</p>
          <input type="text" onChange={(e) => handleInput(e.target.value)} />
          <br/>
          <br/>
          <br/>
          <br/>
          <br/>
        </div>
      )}
    </div>
  );
};

export default Hangman;
