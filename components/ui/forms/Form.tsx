"use client";

import React, { ChangeEvent, ChangeEventHandler, useCallback, useEffect, useState } from "react";
import { Data, StateData } from "../../../app/agents/metaData/states";
import { ncdOptions } from "@/data/ncdOptions";
import { createClient } from '@/utils/client'
import AutoCompleteSelect from "../AutoCompleteSelect";
import { getInsuranceProvidersOptions, SelectOption } from "../../../data/selectOptions";
import { Textarea } from "../textarea";
import { Input } from "../input";



type Props = {
  onStateFormStateChange: (key: string, value: string) => void;
  chatOnChange: ChangeEventHandler<HTMLTextAreaElement>;
};

const getStateOptions = (data: StateData[]) => {
  return data.map((state) => ({
    value: state.description,
    label: state.description,
  }));
};

const FormInputs: React.FC<Props> = (props: Props) => {
  const [guidelinesoptins, setGuidelinesOptions] = useState<SelectOption[]>([])
  const [userEmail, setUserEmail] = useState('')
  const stateOptions = getStateOptions(Data);
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const { user } = session || {}
      setIsLoggedIn(!!session)
      setUserEmail(user?.email || '')
      const options = getInsuranceProvidersOptions({ email: user?.email || '', isSignedIn: !!session });
      setGuidelinesOptions(options)
    }

    checkAuth()

    const { data: { subscription } } = createClient().auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleInsuranceSelectChange = useCallback(
    (value: string) => props.onStateFormStateChange("Guidelines", value),
    [props.onStateFormStateChange],
  );

  const handleStateSelectChange = useCallback(
    (value: string) => props.onStateFormStateChange("State", value),
    [props.onStateFormStateChange],
  );

  const HandleTreatmentSelectChange = useCallback(
    (value: string) => props.onStateFormStateChange("Treatment", value),
    [props.onStateFormStateChange],
  );

  const handleCptChange = useCallback(
    (e: ChangeEvent<any>) =>
      props.onStateFormStateChange("CPT code(s)", e.target.value),
    [props.onStateFormStateChange],
  );

  const handleDiagnosisChange = useCallback(
    (e: ChangeEvent<any>) =>
      props.onStateFormStateChange("Diagnosis", e.target.value),
    [props.onStateFormStateChange],
  );

  const handleHistoryChange = useCallback(
    (e: ChangeEvent<any>) =>
      props.onStateFormStateChange("History", e.target.value),
    [props.onStateFormStateChange],
  );

  return (
    <section className="w-full max-w-3xl mx-auto px-4 space-y-6">
      {/* Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <label className="block text-md font-medium text-gray-900 mb-1">
            Guideline
          </label>
          <AutoCompleteSelect
            options={guidelinesoptins}
            onChange={handleInsuranceSelectChange}

          />
        </div>
        <div>
          <label className="block text-md font-medium text-gray-900 mb-1">
            State
          </label>
          <AutoCompleteSelect
            options={stateOptions}
            onChange={handleStateSelectChange}
          />
        </div>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <label className="block text-md font-medium text-gray-900 mb-1">
            Treatment
          </label>
          <AutoCompleteSelect
            options={ncdOptions}
            onChange={HandleTreatmentSelectChange}
          />
        </div>
        <div>
          <label className="block text-md font-medium text-gray-900 mb-1">
            CPT Code(s)
          </label>
          <Input
            className="w-full h-9 bg-white border-blue-200 text-gray-900 focus-visible:ring-blue-300 focus-visible:border-blue-400"
            placeholder="CPT Codes"
            onChange={handleCptChange}
          />
        </div>
      </div>

      {/* Diagnosis */}
      <div>
        <label className="block text-md font-semi-bold text-black mb-1">
          Diagnosis
        </label>
        <Textarea
          className="w-full bg-white border-blue-200 text-gray-900 focus-visible:ring-blue-300 focus-visible:border-blue-400 min-h-[100px] max-h-[200px] overflow-y-auto resize-y"
          placeholder="knee pain"
          onChange={handleDiagnosisChange}
        />
      </div>

      {/* History */}
      <div>
        <label className="block text-md font-semi-bold text-black mb-1">
          Patient(s) Medical History
        </label>
        <Textarea
          className="w-full bg-white border-blue-200 text-gray-900 focus-visible:ring-blue-300 focus-visible:border-blue-400 min-h-[100px] max-h-[200px] overflow-y-auto resize-y"
          placeholder="knee swelling for over 3 weeks."
          onChange={handleHistoryChange}
        />
      </div>

      {/* Chat Context */}
      <div>
        <label className="block text-md font-semi-bold text-black mb-1">
          Additional Chat Prompt Context (optional)
        </label>
        <Textarea
          className="w-full bg-white border-blue-200 text-gray-900 focus-visible:ring-blue-300 focus-visible:border-blue-400 min-h-[100px] max-h-[200px] overflow-y-auto resize-y"
          placeholder="Get CPT codes"
          onChange={props.chatOnChange}
        />
      </div>
    </section>
  );
};

export default FormInputs;
