const K = 32;

export function calculateElo(winnerElo: number, loserElo: number): { newWinnerElo: number; newLoserElo: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const expectedLoser = 1 / (1 + Math.pow(10, (winnerElo - loserElo) / 400));

  const newWinnerElo = Math.round(winnerElo + K * (1 - expectedWinner));
  const newLoserElo = Math.round(loserElo + K * (0 - expectedLoser));

  return { newWinnerElo, newLoserElo };
}
