const SIZE = 9;
const EMPTY = 0;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function canPlace(board, row, col, value) {
  for (let i = 0; i < SIZE; i++) {
    if (board[row][i] === value || board[i][col] === value) return false;
  }
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (board[boxRow + r][boxCol + c] === value) return false;
    }
  }
  return true;
}

function fillBoard(board) {
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (board[row][col] !== EMPTY) continue;
      for (const value of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
        if (!canPlace(board, row, col, value)) continue;
        board[row][col] = value;
        if (fillBoard(board)) return true;
        board[row][col] = EMPTY;
      }
      return false;
    }
  }
  return true;
}

const flatten = (board) => board.flat().map((n) => (n === EMPTY ? '0' : String(n))).join('');

export function createSudoku(clues = 38) {
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  fillBoard(board);
  const solution = flatten(board);
  const cells = shuffle([...Array(81).keys()]);
  const puzzle = board.map((row) => [...row]);
  let remaining = 81;
  for (const index of cells) {
    if (remaining <= clues) break;
    const row = Math.floor(index / 9);
    const col = index % 9;
    if (puzzle[row][col] === EMPTY) continue;
    puzzle[row][col] = EMPTY;
    remaining--;
  }
  return { puzzle: flatten(puzzle), solution };
}
