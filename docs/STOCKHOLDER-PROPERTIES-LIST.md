# Stockholder 노드 속성 목록 (bizno 없는 노드)

## 작성일
2026-02-17

## 목적
Company 노드(bizno 포함)가 아닌 Stockholder 노드(Person, Major, Institution)의 속성 목록을 검토하기 위한 참고 자료입니다.

---

## Stockholder 노드 타입별 속성 목록

### Person 노드 (개인 주주)

| 속성명 | 타입 | 설명 | 샘플 값 | 표시 여부 | 비고 |
|--------|------|------|---------|-----------|------|
| `stockName` | String | 주주명 (정식 명칭) | `백경순`, `윤강노` | ✅ 표시 | **필수 표시** |
| `stockNameNormalized` | String | 주주명 (정규화) | `백경순` | ❌ 숨김 | stockName과 동일 시 제외 |
| `personId` | String | 개인 주주 고유 ID | `백경순_5`, `윤강노_123` | ⚠️ 선택적 | 기술적 ID |
| `stockSerialNo` | Number | 주주 일련번호 | `5`, `123` | ⚠️ 선택적 | 기술적 ID |
| `shareholderType` | String | 주주 유형 | `PERSON` | ✅ 표시 | **필수 표시** |
| `isInfluential` | Boolean | 영향력 있는 주주 여부 | `true`, `false` | ✅ 표시 | 유용한 정보 |
| `maxStockRatio` | Number | 최대 지분율(%) | `7.45`, `15.8` | ✅ 표시 | **필수 표시** |
| `totalStockRatio` | Number | 총 지분율(%) | `7.45`, `15.8` | ⚠️ 선택적 | maxStockRatio와 동일 시 생략 |
| `totalInvestmentCount` | Number | 총 투자 종목 수 | `1`, `3`, `50` | ✅ 표시 | 유용한 정보 |
| `isActive` | Boolean | 활성 상태 | `true`, `false` | ✅ 표시 | **필수 표시** |
| `dataSource` | String | 데이터 출처 | `DART` | ✅ 표시 | 신뢰성 확인 |
| `updatedAt` | Object/String | 수정일시 | `[object Object]` | ❌ 숨김 | 표시 이슈 |

**샘플 데이터 (Person)**:
```json
{
  "stockName": "백경순",
  "personId": "백경순_5",
  "stockSerialNo": 5,
  "shareholderType": "PERSON",
  "isInfluential": true,
  "maxStockRatio": 7.45,
  "totalStockRatio": 7.45,
  "totalInvestmentCount": 1,
  "isActive": true,
  "dataSource": "DART"
}
```

---

### Major Shareholder 노드 (최대주주)

| 속성명 | 타입 | 설명 | 샘플 값 | 표시 여부 | 비고 |
|--------|------|------|---------|-----------|------|
| `stockName` | String | 주주명 (정식 명칭) | `윤강노`, `박현주` | ✅ 표시 | **필수 표시** |
| `stockNameNormalized` | String | 주주명 (정규화) | `윤강노` | ❌ 숨김 | stockName과 동일 시 제외 |
| `personId` | String | 개인 주주 고유 ID | `윤강노_123` | ⚠️ 선택적 | 기술적 ID |
| `stockSerialNo` | Number | 주주 일련번호 | `123` | ⚠️ 선택적 | 기술적 ID |
| `shareholderType` | String | 주주 유형 | `PERSON` | ✅ 표시 | **필수 표시** |
| `isInfluential` | Boolean | 영향력 있는 주주 여부 | `true` | ✅ 표시 | 유용한 정보 |
| `maxStockRatio` | Number | 최대 지분율(%) | `15.8`, `50.2` | ✅ 표시 | **필수 표시** |
| `totalStockRatio` | Number | 총 지분율(%) | `15.8`, `50.2` | ⚠️ 선택적 | maxStockRatio와 동일 시 생략 |
| `totalInvestmentCount` | Number | 총 투자 종목 수 | `3`, `10` | ✅ 표시 | 유용한 정보 |
| `isActive` | Boolean | 활성 상태 | `true`, `false` | ✅ 표시 | **필수 표시** |
| `dataSource` | String | 데이터 출처 | `DART` | ✅ 표시 | 신뢰성 확인 |
| `updatedAt` | Object/String | 수정일시 | `[object Object]` | ❌ 숨김 | 표시 이슈 |

**샘플 데이터 (Major)**:
```json
{
  "stockName": "윤강노",
  "personId": "윤강노_123",
  "stockSerialNo": 123,
  "shareholderType": "PERSON",
  "isInfluential": true,
  "maxStockRatio": 15.8,
  "totalStockRatio": 15.8,
  "totalInvestmentCount": 3,
  "isActive": true,
  "dataSource": "DART"
}
```

---

### Institution 노드 (기관 주주)

| 속성명 | 타입 | 설명 | 샘플 값 | 표시 여부 | 비고 |
|--------|------|------|---------|-----------|------|
| `stockName` | String | 주주명 (정식 명칭) | `국민연금공단` | ✅ 표시 | **필수 표시** |
| `companyName` | String | 법인명 (Institution만) | `국민연금공단` | ✅ 표시 | Institution만 표시 |
| `stockNameNormalized` | String | 주주명 (정규화) | `국민연금공단` | ❌ 숨김 | stockName과 동일 시 제외 |
| `shareholderType` | String | 주주 유형 | `INSTITUTION`, `CORPORATION` | ✅ 표시 | **필수 표시** |
| `isInfluential` | Boolean | 영향력 있는 주주 여부 | `true` | ✅ 표시 | 유용한 정보 |
| `maxStockRatio` | Number | 최대 지분율(%) | `12.5`, `25.3` | ✅ 표시 | **필수 표시** |
| `totalStockRatio` | Number | 총 지분율(%) | `12.5`, `25.3` | ⚠️ 선택적 | maxStockRatio와 동일 시 생략 |
| `totalInvestmentCount` | Number | 총 투자 종목 수 | `50`, `200` | ✅ 표시 | 유용한 정보 |
| `isActive` | Boolean | 활성 상태 | `true`, `false` | ✅ 표시 | **필수 표시** |
| `dataSource` | String | 데이터 출처 | `DART` | ✅ 표시 | 신뢰성 확인 |
| `updatedAt` | Object/String | 수정일시 | `[object Object]` | ❌ 숨김 | 표시 이슈 |

**샘플 데이터 (Institution)**:
```json
{
  "stockName": "국민연금공단",
  "companyName": "국민연금공단",
  "shareholderType": "INSTITUTION",
  "isInfluential": true,
  "maxStockRatio": 12.5,
  "totalStockRatio": 12.5,
  "totalInvestmentCount": 50,
  "isActive": true,
  "dataSource": "DART"
}
```

---

## 속성 표시 우선순위 (Stockholder 노드)

### P0 (항상 표시)
1. `stockName` (또는 `companyName` - Institution만)
2. `shareholderType`
3. `isActive`
4. `isInfluential`
5. `maxStockRatio`
6. `totalInvestmentCount`
7. `dataSource`

### P1 (조건부 표시)
1. `stockNameNormalized` (stockName과 다를 때만)
2. `personId` (디버깅/고급 사용자용)
3. `stockSerialNo` (디버깅/고급 사용자용)
4. `totalStockRatio` (maxStockRatio와 다를 때만)

### P2 (숨김)
1. `updatedAt` (표시 이슈: `[object Object]`)
2. `createdAt` / `created_at` (이미 제외됨)
3. `nameEmbedding` (이미 제외됨)

---

## 중복 속성 처리 규칙

### 1. stockName vs stockNameNormalized
- **규칙**: 두 값이 동일하면 `stockNameNormalized` 숨김
- **비교**: 대소문자 무시 비교 (`toLowerCase()`)

### 2. maxStockRatio vs totalStockRatio
- **규칙**: 두 값이 동일하면 `totalStockRatio` 숨김
- **비교**: 소수점 2자리까지 비교 (차이 < 0.01)

### 3. stockName vs companyName (Institution만)
- **규칙**: Institution 노드에서 두 값이 동일하면 하나만 표시
- **우선순위**: `stockName` 우선 표시

---

## 프론트엔드 필터링 로직 (Stockholder 노드용)

```javascript
// Stockholder 노드 전용 숨김 목록
const STOCKHOLDER_HIDDEN_PROPS = [
  'createdAt', 'created_at', 'updatedAt', 'nameEmbedding',
  'stockNameNormalized', // deduplicateProps에서 처리
];

// Stockholder 노드 중복 제거
const deduplicateStockholderProps = (props) => {
  const result = { ...props };
  
  // stockName vs stockNameNormalized
  if (result.stockName && result.stockNameNormalized) {
    if (result.stockName.toLowerCase() === result.stockNameNormalized.toLowerCase()) {
      delete result.stockNameNormalized;
    }
  }
  
  // maxStockRatio vs totalStockRatio
  if (result.maxStockRatio && result.totalStockRatio) {
    if (Math.abs(result.maxStockRatio - result.totalStockRatio) < 0.01) {
      delete result.totalStockRatio;
    }
  }
  
  // Institution: stockName vs companyName
  if (result.shareholderType && ['INSTITUTION', 'CORPORATION'].includes(result.shareholderType)) {
    if (result.stockName && result.companyName && 
        result.stockName.toLowerCase() === result.companyName.toLowerCase()) {
      delete result.companyName; // stockName 우선 표시
    }
  }
  
  return result;
};
```

---

## 속성명 한글화 제안 (선택적)

| 원본 속성명 | 한글명 | 설명 |
|------------|--------|------|
| `stockName` | 주주명 | - |
| `shareholderType` | 주주 유형 | - |
| `isInfluential` | 영향력 있는 주주 | - |
| `maxStockRatio` | 최대 지분율 | - |
| `totalStockRatio` | 총 지분율 | - |
| `totalInvestmentCount` | 투자 종목 수 | - |
| `isActive` | 활성 상태 | - |
| `dataSource` | 데이터 출처 | - |
| `personId` | 개인 ID | - |
| `stockSerialNo` | 일련번호 | - |

---

## 참고
- **백엔드 코드**: `backend/app/api/v1/endpoints/graph.py` (424줄)
- **프론트엔드 코드**: `frontend/graph.js` (1315-1320줄)
- **현재 최대 표시 개수**: 10개 (`slice(0, 10)`)

---

**문서 버전**: 1.0  
**최종 업데이트**: 2026-02-17
