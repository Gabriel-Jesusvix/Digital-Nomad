

function sum(a: number, b: number): number {
  return a + b;
}

test("sum returns function example", () => {
  const value = sum(2, 5);
  expect(value).toBe(7)
})