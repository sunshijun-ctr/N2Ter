import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppStore } from '@/stores/useAppStore'

export function OverviewPage() {
  const navigate = useNavigate()
  const { currentNovel, adaptationPlan, setExportDialogOpen } = useAppStore()

  if (!currentNovel) {
    return (
      <>
        <PageHeader title="概览版剧本" description="请先在侧边栏选择项目" />
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          暂无选中项目
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="概览版剧本"
        description={`《${currentNovel.title}》· 预处理完成后自动生成的全书改编报告`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(true)}>
              导出
            </Button>
            <Button size="sm" onClick={() => navigate('/schema-select')}>
              选择详细版类型
            </Button>
          </div>
        }
      />
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Logline</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {currentNovel.summary ?? '一句话故事梗概占位…'}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              { k: '市场类比', v: '《琅琊榜》' },
              { k: '改编难度', v: '中等偏高' },
              { k: '建议集数', v: `${adaptationPlan?.episodeCount ?? 36} 集` },
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
              {(adaptationPlan?.items ?? []).slice(0, 6).map((item) => (
                <div key={item.episodeNum} className="flex gap-3 border-b pb-2 last:border-0">
                  <span className="w-16 shrink-0 text-muted-foreground">
                    第 {item.episodeNum} 集
                  </span>
                  <span>{item.oneLineSummary ?? item.title}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
