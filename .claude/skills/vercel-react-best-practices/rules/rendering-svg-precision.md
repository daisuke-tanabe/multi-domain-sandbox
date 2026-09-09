---
title: Optimize SVG Precision
impact: LOW
impactDescription: reduces file size
tags: rendering, svg, optimization, svgo
---

## Optimize SVG Precision

SVG の座標精度を下げてファイルサイズを減らす。最適な精度は viewBox のサイズに依存するが、一般に精度を下げることを検討すべき。

Incorrect (過剰な精度):

```svg
<path d="M 10.293847 20.847362 L 30.938472 40.192837" />
```

Correct (小数点 1 桁):

```svg
<path d="M 10.3 20.8 L 30.9 40.2" />
```

SVGO で自動化する:

```bash
npx svgo --precision=1 --multipass icon.svg
```
