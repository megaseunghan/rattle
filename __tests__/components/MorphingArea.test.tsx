import { basisPath } from '../../lib/utils/homeFinancialCard';
import { joinChartPath, mixChartCoordinates, splitChartPath } from '../../lib/components/home-financial/MorphingArea';
it('곡선의 시작·중간·끝 좌표를 보존하고 선과 면적에 같은 좌표를 제공한다', () => {
 const from = splitChartPath(basisPath([{ x: 0, y: 160 }, { x: 100, y: 100 }, { x: 322, y: 150 }]));
 const to = splitChartPath(basisPath([{ x: 0, y: 30 }, { x: 100, y: 150 }, { x: 322, y: 50 }]));
 expect(from.parts).toEqual(to.parts);
 expect(mixChartCoordinates(from.numbers, to.numbers, 0)).toEqual(from.numbers);
 expect(mixChartCoordinates(from.numbers, to.numbers, 1)).toEqual(to.numbers);
 const middle = mixChartCoordinates(from.numbers, to.numbers, 0.5);
 expect(middle.at(-1)).toBe(100);
 expect(joinChartPath(to.parts, middle)).not.toMatch(/NaN|undefined/);
 const next = mixChartCoordinates(middle, from.numbers, 0);
 expect(next).toEqual(middle);
});
it('비어 있는 그래프는 0원 선을 만들어 내지 않는다', () => {
 const empty = splitChartPath('');
 expect(empty.numbers).toEqual([]);
 expect(joinChartPath(empty.parts, empty.numbers)).toBe('');
});
