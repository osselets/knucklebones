type NumberSelector<T> = (value: T) => number

export function getMaxBy<T>(array: T[], selectNumber: NumberSelector<T>) {
  return array.reduce((acc, current) => {
    return selectNumber(current) > selectNumber(acc) ? current : acc
  })
}

export function getMinBy<T>(array: T[], selectNumber: NumberSelector<T>) {
  return array.reduce((acc, current) => {
    return selectNumber(current) < selectNumber(acc) ? current : acc
  })
}

export function sortBy<T>(
  array: T[],
  selectNumber: NumberSelector<T>,
  order: 'ascending' | 'descending' = 'ascending'
) {
  const sortedArray = array.slice()

  return sortedArray.sort((a, b) => {
    if (order === 'ascending') {
      return selectNumber(a) - selectNumber(b)
    } else {
      return selectNumber(b) - selectNumber(a)
    }
  })
}

export function sum(array: number[]): number {
  return array.reduce((accumulator, total) => accumulator + total, 0)
}
