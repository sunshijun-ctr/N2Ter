import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function OverviewPage() {
  return (
    <>
      <PageHeader
        title="概览版剧本"
        description="预处理完成后自动生成的全书改编报告"
        actions={<Button variant="outline" size="sm">导出 PDF</Button>}
      />
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Logline</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              一句话故事梗概占位…
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              { k: '市场类比', v: '《xxx》' },
              { k: '改编难度', v: '中等' },
              { k: '建议集数', v: '36 集' },
            ].map((m) => (
              <Card key={m.k}>
                <CardContent className="p-5">
                  <div className="text-xs text-muted-foreground">{m.k}</div>
                  <div className="mt-1 text-lg font-semibold">{m.v}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>分集大纲</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {[1, 2, 3].map((n) => (
                <div key={n} className="flex gap-3 border-b pb-2 last:border-0">
                  <span className="w-16 shrink-0 text-muted-foreground">第 {n} 集</span>
                  <span>分集标题与一句话摘要占位…</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
