import { Card, CardContent } from '@/components/ui/card'

export function Canvas() {
  return (
    <div className="flex-1 overflow-auto bg-background p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 text-center">
          <h2 className="text-lg font-semibold">第 1 集 · 初遇</h2>
          <p className="text-xs text-muted-foreground">源章节：第 1-2 章</p>
        </div>

        <div className="flex flex-col gap-4">
          {[1, 2].map((s) => (
            <Card key={s}>
              <CardContent className="p-5">
                <div className="mb-2 text-sm font-semibold">场景 {s}</div>
                <p className="mb-3 text-xs text-muted-foreground">内景 - 咖啡馆 - 日</p>
                <p className="text-sm leading-relaxed">
                  动作描述占位文本…（画布即 source of truth，用户可在此手动修改场景与对白）
                </p>
                <div className="mt-3 rounded-md bg-secondary/50 p-3 text-sm">
                  <span className="font-medium">角色 A：</span>
                  对白占位…
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
