import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, X, Calendar, Lightbulb, Vote, Sparkles, Target } from 'lucide-react';
import { votingContract } from '@/lib/contract';
import { toast } from '@/hooks/use-toast';

const proposalSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  duration: z.number().min(1, 'Duration must be at least 1 hour'),
});

type ProposalForm = z.infer<typeof proposalSchema>;

interface CreateProposalDialogProps {
  onSuccess: () => void;
}

// Predefined option templates for common proposal types
const OPTION_TEMPLATES = {
  yesNo: ['Yes', 'No'],
  yesNoAbstain: ['Yes', 'No', 'Abstain'],
  approval: ['Approve', 'Reject', 'Request Changes'],
  funding: ['Approve Full Amount', 'Approve Partial Amount', 'Reject Funding', 'Request More Details'],
  governance: ['Implement Immediately', 'Implement with Modifications', 'Delay Implementation', 'Reject Proposal'],
  partnership: ['Approve Partnership', 'Reject Partnership', 'Negotiate Terms', 'Request Due Diligence']
};

const TEMPLATE_DESCRIPTIONS = {
  yesNo: 'Simple binary choice',
  yesNoAbstain: 'Binary choice with abstention option',
  approval: 'Standard approval process',
  funding: 'Funding request options',
  governance: 'Governance change options',
  partnership: 'Partnership proposal options'
};

export function CreateProposalDialog({ onSuccess }: CreateProposalDialogProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState(['', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const form = useForm<ProposalForm>({
    resolver: zodResolver(proposalSchema),
    defaultValues: {
      title: '',
      description: '',
      duration: 24, // Default 24 hours
    },
  });

  const addOption = () => {
    if (options.length < 10) {
      setOptions([...options, '']);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const applyTemplate = (templateKey: string) => {
    const template = OPTION_TEMPLATES[templateKey as keyof typeof OPTION_TEMPLATES];
    if (template) {
      setOptions([...template]);
      setSelectedTemplate(templateKey);
    }
  };

  const clearOptions = () => {
    setOptions(['', '']);
    setSelectedTemplate(null);
  };

  const onSubmit = async (data: ProposalForm) => {
    const validOptions = options.filter(option => option.trim() !== '');
    
    if (validOptions.length < 2) {
      toast({
        title: "Invalid Options",
        description: "At least 2 valid options are required.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const durationInSeconds = data.duration * 60 * 60; // Convert hours to seconds
      
      const success = await votingContract.createProposal(
        data.title,
        data.description,
        validOptions,
        durationInSeconds
      );

      if (success) {
        toast({
          title: "Proposal Created",
          description: "Your proposal has been submitted to the DAO.",
        });
        
        // Reset form
        form.reset();
        setOptions(['', '']);
        setSelectedTemplate(null);
        setOpen(false);
        onSuccess();
      } else {
        throw new Error('Proposal creation failed');
      }
    } catch (error) {
      toast({
        title: "Creation Failed",
        description: "There was an error creating your proposal. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center space-x-2">
          <Plus className="h-4 w-4" />
          <span>Create Proposal</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            <span>Create New Proposal</span>
          </DialogTitle>
          <DialogDescription>
            Create a new voting proposal for the DAO. All votes will be encrypted using FHE technology for complete privacy.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title" className="flex items-center space-x-1">
              <Target className="h-4 w-4" />
              <span>Proposal Title</span>
            </Label>
            <Input
              id="title"
              placeholder="Enter a clear, descriptive title..."
              {...form.register('title')}
            />
            {form.formState.errors.title && (
              <p className="text-sm text-red-500">{form.formState.errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Provide a detailed description of the proposal, including background, rationale, and expected outcomes..."
              rows={4}
              {...form.register('description')}
            />
            {form.formState.errors.description && (
              <p className="text-sm text-red-500">{form.formState.errors.description.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration" className="flex items-center space-x-1">
              <Calendar className="h-4 w-4" />
              <span>Voting Duration (hours)</span>
            </Label>
            <Input
              id="duration"
              type="number"
              min="1"
              max="720"
              placeholder="24"
              {...form.register('duration', { valueAsNumber: true })}
            />
            <div className="flex items-center text-xs text-muted-foreground">
              <Calendar className="h-3 w-3 mr-1" />
              Voting will end {form.watch('duration') || 24} hours after creation
            </div>
            {form.formState.errors.duration && (
              <p className="text-sm text-red-500">{form.formState.errors.duration.message}</p>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="flex items-center space-x-1">
                <Vote className="h-4 w-4" />
                <span>Voting Options</span>
              </Label>
              <div className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">Quick Templates</span>
              </div>
            </div>

            {/* Option Templates */}
            <Card className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-dashed">
              <CardContent className="p-0">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(OPTION_TEMPLATES).map(([key, template]) => (
                    <Button
                      key={key}
                      type="button"
                      variant={selectedTemplate === key ? "default" : "outline"}
                      size="sm"
                      onClick={() => applyTemplate(key)}
                      className="h-auto p-2 flex flex-col items-start"
                    >
                      <span className="font-medium text-xs capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                      <span className="text-xs text-muted-foreground text-left">
                        {TEMPLATE_DESCRIPTIONS[key as keyof typeof TEMPLATE_DESCRIPTIONS]}
                      </span>
                    </Button>
                  ))}
                </div>
                <div className="mt-3 flex justify-between items-center">
                  <p className="text-xs text-muted-foreground">
                    Choose a template to quickly set up common voting options
                  </p>
                  {selectedTemplate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearOptions}
                      className="text-xs"
                    >
                      Clear Template
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Custom Options */}
            <div className="space-y-3">
              {options.map((option, index) => (
                <div key={index} className="group">
                  <div className="flex items-center space-x-2">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-medium text-primary">{index + 1}</span>
                    </div>
                    <Input
                      placeholder={`Option ${index + 1} - Enter voting choice...`}
                      value={option}
                      onChange={(e) => updateOption(index, e.target.value)}
                      className="flex-1"
                    />
                    {options.length > 2 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeOption(index)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {option.trim() && (
                    <div className="ml-10 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        ✓ Valid option
                      </Badge>
                    </div>
                  )}
                </div>
              ))}
              
              {options.length < 10 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={addOption}
                  className="w-full border-dashed hover:border-solid transition-all"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Another Option
                </Button>
              )}
              
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-start space-x-2">
                  <Vote className="h-4 w-4 text-primary mt-0.5" />
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium mb-1">Voting Options Guidelines:</p>
                    <ul className="space-y-1">
                      <li>• Minimum 2 options required, maximum 10 allowed</li>
                      <li>• Make options clear and mutually exclusive</li>
                      <li>• Consider adding "Abstain" for controversial topics</li>
                      <li>• All votes will be encrypted for complete privacy</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="min-w-[120px]">
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating...
                </>
              ) : (
                <>
                  <Lightbulb className="h-4 w-4 mr-2" />
                  Create Proposal
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}