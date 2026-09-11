/**
 * Validates if a string is a valid day key in YYYY-MM-DD format
 * @param s The string to validate
 * @returns true if the string is a valid date in YYYY-MM-DD format, false otherwise
 */
export function isValidDayKey(s: string): boolean {
  // Check format: must be exactly YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return false;
  }

  // Parse the date components
  const parts = s.split('-');
  const year = parseInt(parts[0]!, 10);
  const month = parseInt(parts[1]!, 10);
  const day = parseInt(parts[2]!, 10);

  // Validate month range (1-12)
  if (month < 1 || month > 12) {
    return false;
  }

  // Validate day range (1-31, will refine by month)
  if (day < 1 || day > 31) {
    return false;
  }

  // Days in each month (non-leap year)
  const daysInMonth: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // Check for leap year
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

  // Get max days for the month
  const maxDays = month === 2 && isLeapYear ? 29 : daysInMonth[month - 1];

  // Validate day against month
  if (day > maxDays!) {
    return false;
  }

  return true;
}
